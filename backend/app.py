import os
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel
from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

load_dotenv()

app = FastAPI(
    title="Company Brain API",
    description="Private company knowledge assistant with document-grounded AI answers.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

CHUNK_SIZE = 900
CHUNK_OVERLAP = 150
TOP_K = 4

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

chunks = []
documents = []
chat_history = []
vectorizer = None
chunk_matrix = None

print("Company Brain API ready")


class QuestionRequest(BaseModel):
    question: str


def clean_filename(filename: str) -> str:
    name = Path(filename).name
    return re.sub(r"[^A-Za-z0-9_. -]", "_", name).strip() or "document.pdf"


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP):
    normalized = " ".join(text.split())

    if not normalized:
        return []

    step = max(size - overlap, 1)
    return [
        normalized[start : start + size]
        for start in range(0, len(normalized), step)
        if normalized[start : start + size].strip()
    ]


def rebuild_index():
    global vectorizer
    global chunk_matrix

    if not chunks:
        vectorizer = None
        chunk_matrix = None
        return

    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
    chunk_matrix = vectorizer.fit_transform([chunk["text"] for chunk in chunks])


def extract_pdf_chunks(file_path: Path, original_name: str, document_id: str):
    reader = PdfReader(str(file_path))
    extracted_chunks = []

    for page_number, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""

        for chunk_number, text in enumerate(chunk_text(page_text), start=1):
            extracted_chunks.append(
                {
                    "id": f"{document_id}:p{page_number}:c{chunk_number}",
                    "document_id": document_id,
                    "source": original_name,
                    "page": page_number,
                    "text": text,
                }
            )

    return extracted_chunks


def build_prompt(question: str, retrieved_chunks):
    context = "\n\n".join(
        f"[{item['source']} - page {item['page']}]\n{item['text']}"
        for item in retrieved_chunks
    )

    return f"""
You are Company Brain, a secure internal company knowledge assistant.
Answer using only the provided company document context.
If the answer is not present in the context, say that the uploaded documents do not contain enough information.
Keep the answer clear, useful, and grounded. Include source names and page numbers when relevant.

Context:
{context}

Question:
{question}

Answer:
"""


@app.get("/health")
def health_check():
    return {
        "status": "ready",
        "documents": len(documents),
        "chunks": len(chunks),
        "retrieval": "tfidf",
    }


@app.get("/documents")
def list_documents():
    return {"documents": documents}


@app.get("/history")
def get_history():
    return {"messages": chat_history[-30:]}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

    document_id = str(uuid.uuid4())
    original_name = clean_filename(file.filename)
    stored_name = f"{document_id}-{original_name}"
    file_path = UPLOAD_DIR / stored_name

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded PDF: {exc}") from exc

    try:
        extracted_chunks = extract_pdf_chunks(file_path, original_name, document_id)
        page_count = len(PdfReader(str(file_path)).pages)
    except Exception as exc:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not read this PDF: {exc}") from exc

    if not extracted_chunks:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="No readable text was found in this PDF.")

    chunks.extend(extracted_chunks)
    documents.append(
        {
            "id": document_id,
            "name": original_name,
            "stored_name": stored_name,
            "pages": page_count,
            "chunks": len(extracted_chunks),
            "uploaded_at": datetime.utcnow().isoformat() + "Z",
        }
    )

    try:
        rebuild_index()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not index this PDF: {exc}") from exc

    return {
        "message": "PDF uploaded successfully",
        "document": documents[-1],
        "total_documents": len(documents),
        "total_chunks": len(chunks),
    }


@app.post("/ask")
def ask_question(request: QuestionRequest):
    if chunk_matrix is None or vectorizer is None:
        return {
            "question": request.question,
            "answer": "Please upload at least one company PDF before asking a question.",
            "sources": [],
        }

    question = request.question.strip()

    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    query_vector = vectorizer.transform([question])
    similarities = cosine_similarity(query_vector, chunk_matrix).flatten()
    ranked_indices = similarities.argsort()[::-1][: min(TOP_K, len(chunks))]

    retrieved_chunks = []
    for chunk_index in ranked_indices:
        item = chunks[int(chunk_index)]
        retrieved_chunks.append(
            {
                **item,
                "score": float(similarities[int(chunk_index)]),
            }
        )

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": build_prompt(question, retrieved_chunks)}],
    )

    answer = response.choices[0].message.content
    sources = [
        {
            "source": item["source"],
            "page": item["page"],
            "chunk_id": item["id"],
        }
        for item in retrieved_chunks
    ]

    chat_history.append(
        {
            "question": question,
            "answer": answer,
            "sources": sources,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
    )

    return {
        "question": question,
        "answer": answer,
        "sources": sources,
    }

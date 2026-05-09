import os
from dotenv import load_dotenv
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from groq import Groq

# Load env
load_dotenv()

# Groq client
client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)

# Read PDF
reader = PdfReader("Company Policy.pdf")

text = ""

for page in reader.pages:
    text += page.extract_text()

print("\nPDF Loaded:\n")
print(text[:300])

# Chunking
chunks = [text[i:i+500] for i in range(0, len(text), 500)]

print("\nChunks created:", len(chunks))

# Embedding model
model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2"
)

# Create embeddings
embeddings = model.encode(chunks)

# FAISS index
dimension = embeddings.shape[1]

index = faiss.IndexFlatL2(dimension)

index.add(np.array(embeddings))

print("\nFAISS index ready")

# Query
query = "What is the leave policy?"

query_embedding = model.encode([query])

# Search
distances, indices = index.search(
    np.array(query_embedding),
    k=1
)

context = chunks[indices[0][0]]

print("\nRetrieved Context:\n")
print(context)

# Prompt
prompt = f"""
Answer ONLY from the context below.

Context:
{context}

Question:
{query}

Answer:
"""

# Groq response
response = client.chat.completions.create(
    model="llama-3.1-8b-instant",   
    messages=[
        {
            "role": "user",
            "content": prompt
        }
    ]
)

answer = response.choices[0].message.content

print("\nAI Answer:\n")
print(answer)
# Company Brain Deployment Guide

This project is ready to publish as a demo with:

- Backend API on Render
- Frontend dashboard on Vercel
- Groq API key stored as a secret on Render

## 1. Put The Project On GitHub

Create a new GitHub repository named `company-brain`.

Upload these two folders and files:

- `backend`
- `frontend`
- `render.yaml`
- `DEPLOYMENT.md`

Do not upload private `.env` files.
The `.gitignore` file already excludes local folders like `backend/venv`, `frontend/node_modules`, build files, uploads, and secrets.

## 2. Deploy Backend On Render

1. Go to Render.
2. Choose **New +**.
3. Choose **Blueprint**.
4. Connect your GitHub repository.
5. Render will read `render.yaml`.
6. Add environment variable:
   - `GROQ_API_KEY`
   - value: your Groq API key
7. Deploy.

After deployment, Render gives a URL like:

```text
https://company-brain-api.onrender.com
```

Test this URL:

```text
https://company-brain-api.onrender.com/health
```

It should show:

```json
{"status":"ready","documents":0,"chunks":0}
```

## 3. Deploy Frontend On Vercel

1. Go to Vercel.
2. Choose **Add New Project**.
3. Import the same GitHub repository.
4. Set **Root Directory** to:

```text
frontend
```

5. Add environment variable:
   - `REACT_APP_API_URL`
   - value: your Render backend URL, for example:

```text
https://company-brain-api.onrender.com
```

6. Deploy.

Vercel gives your public demo link, like:

```text
https://company-brain.vercel.app
```

## 4. Share This Demo Message

```text
Hi, I built Company Brain, an AI assistant that answers questions from company PDFs like HR policies, SOPs, onboarding guides, and internal documents.

I am looking for feedback from startups, HR teams, and small companies.

Try the demo here:
[YOUR VERCEL LINK]

You can upload a sample PDF and ask questions like:
- What is the leave policy?
- What should a new employee do first?
- What are the approval steps?

I would love your honest feedback.
```

## Important Demo Note

This demo stores uploaded PDFs in server memory/local storage. It is fine for early testing, but before real paid customers you should add:

- user login
- company workspaces
- PostgreSQL
- private cloud file storage
- document deletion
- usage limits

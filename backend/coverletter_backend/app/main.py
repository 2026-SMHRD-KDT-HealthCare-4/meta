from fastapi import FastAPI, HTTPException, Body, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import os
from typing import Dict, List, Optional

from app.models.schemas import UserProfile, JDContext, DraftResponse, QAEvaluation
from app.services.vectorizer import UserDataVectorizer
from app.services.jd_builder import JDContextBuilder
from app.services.retriever import RAGRetriever
from app.services.generator import DraftGenerator
from app.services.evaluator import QAEvaluator
from app.utils.docx_helper import DOCXGenerator

load_dotenv()

app = FastAPI(title="AI Cover Letter API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Services
vectorizer = UserDataVectorizer()
jd_builder = JDContextBuilder()
retriever = RAGRetriever(vectorizer)
generator = DraftGenerator()
evaluator = QAEvaluator(vectorizer)
docx_gen = DOCXGenerator()

# In-memory storage for session data (Replace with DB in production)
session_storage = {}

@app.post("/api/user/profile")
async def save_profile(user_id: str, profile: UserProfile):
    try:
        count = vectorizer.process_and_store(user_id, profile)
        session_storage[user_id] = {"profile": profile}
        return {"status": "success", "chunks_indexed": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jd/build", response_model=JDContext)
async def build_jd(job_name: str):
    try:
        context = await jd_builder.build_context(job_name)
        return context
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/draft/generate", response_model=DraftResponse)
async def generate_draft(user_id: str, jd_context: JDContext):
    try:
        profile_data = session_storage.get(user_id)
        if not profile_data:
            raise HTTPException(status_code=404, detail="User profile not found")
        
        profile = profile_data["profile"]
        
        # 1. RAG Retrieval
        relevant_exp = retriever.retrieve_relevant_experience(user_id, jd_context)
        final_context = retriever.build_final_context(jd_context, relevant_exp)
        
        # 2. Base Draft Generation
        draft = await generator.generate_base_draft(final_context, profile)
        
        # Store for evaluation later
        session_storage[user_id]["last_draft"] = draft
        session_storage[user_id]["jd_keywords"] = jd_context.keywords
        
        return draft
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/draft/weave", response_model=DraftResponse)
async def weave_draft(user_id: str, company_info: str = Body(..., embed=True)):
    try:
        profile_data = session_storage.get(user_id)
        if not profile_data or "last_draft" not in profile_data:
            raise HTTPException(status_code=404, detail="Base draft not found. Generate base draft first.")
        
        base_draft = profile_data["last_draft"]
        weaved_draft = await generator.weave_company_info(base_draft, company_info)
        
        # Update session
        session_storage[user_id]["last_draft"] = weaved_draft
        
        return weaved_draft
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/qa/evaluate", response_model=QAEvaluation)
async def evaluate_draft(user_id: str, edited_sections: Dict[str, str]):
    try:
        data = session_storage.get(user_id)
        if not data or "last_draft" not in data:
            raise HTTPException(status_code=404, detail="Session data not found")
        
        original_draft = data["last_draft"]
        jd_keywords = data["jd_keywords"]
        
        evaluation = evaluator.evaluate(original_draft, edited_sections, jd_keywords)
        return evaluation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/download/docx")
async def download_docx(job_name: str, edited_sections: Dict[str, str]):
    try:
        docx_file = docx_gen.generate(job_name, edited_sections)
        from urllib.parse import quote
        encoded_filename = quote(f"자기소개서_{job_name}.docx")
        return StreamingResponse(
            docx_file,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            }
        )
    except Exception as e:
        import traceback
        with open("error_log.txt", "a", encoding="utf-8") as f:
            f.write("\n" + "="*50 + "\n")
            f.write(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)

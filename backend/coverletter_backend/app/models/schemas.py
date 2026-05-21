from pydantic import BaseModel, Field
from typing import List, Optional

class UserProfile(BaseModel):
    target_job: str = Field(..., description="지원 직종")
    age: int = Field(..., description="나이")
    tech_stack: List[str] = Field(..., description="기술 스택")
    certifications: List[str] = Field(..., description="자격증")
    experience: str = Field(..., description="주요 경험")
    strength: str = Field(..., description="강점")
    motivation: str = Field(..., description="지원 동기")

class JDKeyword(BaseModel):
    keyword: str
    frequency: float

class JDContext(BaseModel):
    job_name: str
    context: str
    keywords: List[JDKeyword]

class DraftSection(BaseModel):
    section_name: str
    situation: str
    action_draft: str
    result_hint: str
    placeholder_metrics: List[str]

class DraftResponse(BaseModel):
    sections: List[DraftSection]

class QAEvaluation(BaseModel):
    job_alignment: float
    content_preservation: float
    placeholder_completion: float
    gate_passed: bool
    feedback: List[str]

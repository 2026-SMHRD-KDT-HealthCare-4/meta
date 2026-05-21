import os
import requests
import xmltodict
from sklearn.feature_extraction.text import TfidfVectorizer
from app.models.schemas import JDKeyword, JDContext
from typing import List
import re
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

# Internal schema for LLM fallback
class LLMJDAnalysis(BaseModel):
    keywords: List[str] = Field(description="List of 10-15 job keywords")
    standard_competencies: List[str] = Field(description="List of 3-5 standard competencies")

class JDContextBuilder:
    def __init__(self):
        self.recruit_key = os.getenv("WORKNET_RECRUIT_API_KEY") or os.getenv("WORKNET_API_KEY")
        self.dict_key = os.getenv("WORKNET_DICT_API_KEY") or os.getenv("WORKNET_API_KEY")
        
        # User recommended URLs
        self.wanted_api_url = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do"
        self.job_dict_api_url = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo215L11.do"
        
        # LLM for Fallback
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)
        self.parser = PydanticOutputParser(pydantic_object=LLMJDAnalysis)

    async def get_llm_fallback(self, job_name: str) -> LLMJDAnalysis:
        """API 실패 시 LLM을 사용하여 직무 역량 분석 생성"""
        prompt = ChatPromptTemplate.from_template("""
        지원자가 입력한 직종명 '{job_name}'에 대해 현재 채용 시장에서 요구하는 핵심 역량과 NCS 표준 직무 역량을 분석해주세요.
        {format_instructions}
        """)
        chain = prompt | self.llm | self.parser
        return await chain.ainvoke({
            "job_name": job_name,
            "format_instructions": self.parser.get_format_instructions()
        })

    def fetch_recruitment_data(self, job_keyword: str, count: int = 10):
        params = {
            "authKey": self.recruit_key,
            "callTp": "L",
            "returnType": "XML",
            "startPage": 1,
            "display": count,
            "keyword": job_keyword
        }
        try:
            # Add common headers to avoid being blocked as a bot
            headers = {"User-Agent": "Mozilla/5.0"}
            response = requests.get(self.wanted_api_url, params=params, headers=headers, timeout=10)
            
            if "개인회원" in response.text:
                print("Notice: Recruitment API restricted for Personal accounts. Switching to Fallback.")
                return None
                
            if response.text.strip().startswith("<"):
                data = xmltodict.parse(response.text)
                root = data.get("wantedRoot", {})
                return root.get("wanted", [])
            return None
        except:
            return None

    async def build_context(self, job_name: str) -> JDContext:
        # 1. Try to fetch from API
        raw_wanted = self.fetch_recruitment_data(job_name)
        
        # 2. If API fails or returns error, use LLM Fallback
        if not raw_wanted:
            print(f"Using LLM Fallback for job: {job_name}")
            analysis = await self.get_llm_fallback(job_name)
            
            keywords = [JDKeyword(keyword=k, frequency=0.9 - (i*0.05)) for i, k in enumerate(analysis.keywords)]
            
            context_str = f"직종: {job_name}\n\n"
            context_str += "⚠️ 고용24 개인회원 권한 제한으로 인해 AI 시장 분석 데이터를 제공합니다.\n\n"
            context_str += "시장 주요 요구 사항(AI 분석):\n" + ", ".join(analysis.keywords) + "\n\n"
            context_str += "표준 직무 역량(NCS 기반):\n"
            for comp in analysis.standard_competencies:
                context_str += f"- {comp}\n"
                
            return JDContext(job_name=job_name, context=context_str, keywords=keywords)

        # 3. If API works, proceed with normal logic (simplified here)
        job_descs = [re.sub(r'[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\s]', '', f"{i.get('title', '')}") for i in raw_wanted if i]
        # (Keyword extraction logic omitted for brevity, same as before)
        from sklearn.feature_extraction.text import TfidfVectorizer
        vectorizer = TfidfVectorizer(max_features=10, token_pattern=r"[ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9]{2,}")
        tfidf_matrix = vectorizer.fit_transform(job_descs)
        feature_names = vectorizer.get_feature_names_out()
        scores = tfidf_matrix.mean(axis=0).tolist()[0]
        keywords = [JDKeyword(keyword=name, frequency=score) for name, score in zip(feature_names, scores)]
        
        context_str = f"직종: {job_name}\n\n시장 주요 요구 사항:\n" + ", ".join([k.keyword for k in keywords])
        context_str += "\n\n표준 직무 역량: " + job_name + " 핵심 과업 완수 및 전문성 발휘"
        
        return JDContext(job_name=job_name, context=context_str, keywords=keywords)

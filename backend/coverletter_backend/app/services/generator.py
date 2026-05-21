import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from app.models.schemas import DraftResponse, DraftSection, UserProfile
from typing import List, Optional

class DraftGenerator:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.7,
            openai_api_key=os.getenv("OPENAI_API_KEY")
        )
        self.parser = PydanticOutputParser(pydantic_object=DraftResponse)

    async def generate_base_draft(self, context: str, profile: UserProfile) -> DraftResponse:
        system_prompt = """
        당신은 전문적인 취업 컨설턴트입니다. 제공된 사용자의 경험 데이터와 직무 역량 컨텍스트를 바탕으로 자기소개서 초안을 작성해주세요.
        
        [작성 원칙]
        1. STAR(Situation, Task, Action, Result) 구조를 철저히 따릅니다.
        2. 사용자의 실제 경험 데이터(Fact)에 기반하여 작성하며, 허구의 사실을 지어내지 마세요.
        3. 구체적인 수치나 성과가 필요한 부분은 [수치 입력]과 같이 플레이스홀더로 남겨주세요.
        4. placeholder_metrics 리스트에는 사용자가 해당 섹션에서 채워야 할 구체적인 데이터 항목들을 나열하세요.
        5. 기업명이 확정되지 않았으므로 지칭은 '귀사'로 고정합니다.
        
        {format_instructions}
        """
        
        user_prompt = """
        [지원 직무 및 역량 컨텍스트]
        {context}
        
        [사용자 기본 정보]
        - 직종: {target_job}
        - 기술 스택: {tech_stack}
        - 강점: {strength}
        
        위 정보를 바탕으로 '지원동기', '직무역량', '성장과정', '입사 후 포부' 4개 섹션에 대한 초안을 작성해주세요.
        """
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("user", user_prompt)
        ])
        
        input_data = {
            "context": context,
            "target_job": profile.target_job,
            "tech_stack": ", ".join(profile.tech_stack),
            "strength": profile.strength,
            "format_instructions": self.parser.get_format_instructions()
        }
        
        chain = prompt | self.llm | self.parser
        return await chain.ainvoke(input_data)

    async def weave_company_info(self, base_draft: DraftResponse, company_info: str) -> DraftResponse:
        system_prompt = """
        기존의 자기소개서 초안에 특정 기업의 가치관이나 정보를 자연스럽게 녹여내는 '위빙(Weaving)' 작업을 수행해주세요.
        
        [지시 사항]
        1. 기존 초안의 [귀사]를 실제 기업명으로 치환하세요 (기업 정보에서 추출).
        2. 기업의 인재상, 비전, 최근 소식 등을 도입부나 포부 영역에 1~2문장 내외로 자연스럽게 반영하세요.
        3. 기존의 STAR 구조와 핵심 경험 내용은 유지해야 합니다.
        
        {format_instructions}
        """
        
        user_prompt = """
        [기존 자기소개서 초안]
        {base_draft_json}
        
        [기업 정보]
        {company_info}
        
        위 내용을 반영하여 위빙된 자기소개서를 작성해주세요.
        """
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("user", user_prompt)
        ])
        
        input_data = {
            "base_draft_json": base_draft.model_dump_json(),
            "company_info": company_info,
            "format_instructions": self.parser.get_format_instructions()
        }
        
        chain = prompt | self.llm | self.parser
        return await chain.ainvoke(input_data)

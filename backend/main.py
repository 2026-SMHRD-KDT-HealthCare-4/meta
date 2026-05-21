import os
import json
import random
import asyncio
import uuid
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from openai import AsyncOpenAI

from daap_engine import DAAPEngine
from logic_engine import LogicEngine
from semantic_engine import SemanticEngine
from evaluator import Evaluator
from rag_engine import RAGEngine

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
rag_engine = RAGEngine(os.getenv("OPENAI_API_KEY"))

# CV 데이터 매핑 함수
def get_expression_score(expression: str, probability: float) -> float:
    # 7가지 기본 감정 점수화 (안정도 기준)
    scores = {
        "neutral": 1.0,
        "happy": 1.0,
        "surprised": 0.9,
        "sad": 0.8,
        "fearful": 0.7,
        "disgusted": 0.7,
        "angry": 0.6
    }
    base_score = scores.get(expression, 1.0)
    # 확률이 낮으면 중립(1.0)에 가깝게 보정
    return 1.0 - (1.0 - base_score) * probability

@app.get("/")
async def root():
    return {"message": "AI Metacognition Interview Simulator API"}

@app.post("/upload")
async def upload_resume(files: List[UploadFile] = File(...), session_id: str = Form(None)):
    if not session_id:
        session_id = str(uuid.uuid4())
    
    upload_dir = f"./uploads/{session_id}"
    os.makedirs(upload_dir, exist_ok=True)
    
    total_chunks = 0
    for file in files:
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        chunks = await rag_engine.ingest_document(session_id, file_path, file.filename)
        if chunks:
            total_chunks += chunks
            
    return {"session_id": session_id, "total_chunks": total_chunks}

@app.websocket("/ws/interview")
async def interview_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # 세션별로 독립적인 분석 엔진 생성
    session_daap = DAAPEngine()
    session_logic = LogicEngine(client)
    session_semantic = SemanticEngine()
    session_evaluator = Evaluator(client)
    
    last_probe_content = "인터뷰 주제 설정"
    session_id = None

    try:
        # 초기 메시지 대기 (session_id 포함 가능)
        init_data = await websocket.receive_text()
        init_message = json.loads(init_data)
        session_id = init_message.get("session_id")

        # 초기 환영 메시지 및 추천 질문 생성
        welcome_text = "메타인지 인터뷰 시스템에 오신 것을 환영합니다."
        initial_options = []
        
        if session_id:
            summary = await rag_engine.get_document_summary(session_id)
            if summary:
                welcome_text = "지원자의 이력서와 포트폴리오 분석을 완료했습니다. 아래 추천 주제 중 하나를 선택하거나, 새로운 주제를 입력하여 면접을 시작해 보세요."
                
                # DAAPEngine을 사용하여 초기 추천 질문 생성
                prompt = f"""
                당신은 시니어 면접관입니다. 다음 지원자의 이력서 요약 내용을 보고, 면접을 시작하기 좋은 3가지 질문 주제를 생성하십시오.
                
                [지원자 요약]
                {summary}
                
                [생성 규칙]
                1. 주제 1 (Icebreaking/Personality): 지원자의 긴장을 풀 수 있는 부드러운 질문이나 가치관 확인.
                2. 주제 2 (Project/Experience): 이력서에서 가장 눈에 띄는 프로젝트나 성과에 대한 구체적 질문.
                3. 주제 3 (Technical/Core): 지원자의 핵심 기술 역량이나 지식의 깊이를 검증할 수 있는 질문.
                
                반드시 JSON 리스트 형식으로만 응답하십시오. 예: ["주제1", "주제2", "주제3"]
                """
                try:
                    res = await client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "system", "content": prompt}],
                        response_format={"type": "json_object"} if False else None # JSON 모드 대신 리스트 파싱 시도
                    )
                    # 리스트 형태 파싱 (GPT가 가끔 JSON 오브젝트로 줄 때를 대비)
                    content = res.choices[0].message.content
                    initial_options = json.loads(content)
                    if isinstance(initial_options, dict):
                        initial_options = list(initial_options.values())[0] if isinstance(list(initial_options.values())[0], list) else list(initial_options.values())
                except Exception as e:
                    print(f"Initial proposal error: {e}")
                    initial_options = ["자기소개 및 지원 동기", "주요 프로젝트 경험", "본인만의 기술적 강점"]
            else:
                initial_options = ["자기소개", "직무 전문성", "협업 경험"]
        else:
            initial_options = ["자기소개", "기술적 도전 과제", "팀워크 경험"]

        await websocket.send_text(json.dumps({
            "type": "probe",
            "content": welcome_text,
            "metrics": {"depth": 0, "survival_probability": 1.0, "semantic_energy": 0, "logic_consistency": True, "bloom_level": 1, "ciqs": 1},
            "initial_recommendations": initial_options
        }))

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type", "answer")
            content = message.get("content", "")

            if msg_type == "answer":
                user_text = content
                expression = message.get("expression", "neutral")
                expr_prob = message.get("expression_probability", 0.0)
                gaze_focus = message.get("gaze_focus", 1.0)
                
                expr_score = get_expression_score(expression, expr_prob)
                final_cv_score = (expr_score * 0.7) + (gaze_focus * 0.3)

                # RAG 검색 및 기타 분석 병렬 실행 (초저지연)
                tasks = [
                    session_semantic.get_metacognitive_uncertainty(user_text), # 이 함수가 async가 아니면 래핑 필요하나 일단 진행
                    session_logic.check_consistency(user_text, session_id=session_id, rag_engine=rag_engine),
                    session_evaluator.get_dynamic_scores(user_text, last_probe_content)
                ]
                
                # session_semantic.get_metacognitive_uncertainty 가 동기 함수인 경우를 대비해 래핑
                async def get_uncertainty():
                    return session_semantic.get_metacognitive_uncertainty(user_text)
                
                # RAG 컨텍스트 가져오기 (session_id가 있을 때만)
                async def get_rag_context():
                    if session_id:
                        return await rag_engine.query(session_id, user_text)
                    return ""

                # 실제 병렬 실행
                uncertainty_task = asyncio.create_task(get_uncertainty())
                logic_task = asyncio.create_task(session_logic.check_consistency(user_text, session_id=session_id, rag_engine=rag_engine))
                eval_task = asyncio.create_task(session_evaluator.get_dynamic_scores(user_text, last_probe_content))
                rag_task = asyncio.create_task(get_rag_context())

                uncertainty, (consistent, logic_reason), dynamic_scores, rag_context = await asyncio.gather(
                    uncertainty_task, logic_task, eval_task, rag_task
                )
                
                # 3. 생존 확률 업데이트
                survival_prob = session_daap.update_survival(1.0 if consistent or session_daap.current_depth == 0 else 0.4, uncertainty, final_cv_score)
                
                # 4. CIQS 및 블룸 위계 평가
                bloom_level = dynamic_scores.get("bloom_level", 2)
                relevance = dynamic_scores.get("relevance", 0.5)
                ciqs = session_evaluator.calculate_ciqs(bloom_level, 1.0 if consistent else 0.4, relevance)
                grade_info = session_evaluator.get_grade_info(ciqs)
                
                # 5. 다음 탐침 질문 생성 지시 (RAG 컨텍스트 및 관련성 점수 주입)
                probe_instruction = session_daap.get_next_probe_instruction(user_text, rag_context, relevance=relevance)
                
                # 메트릭 먼저 전송
                status_info = session_daap.get_stats()
                await websocket.send_text(json.dumps({
                    "type": "metrics_update",
                    "metrics": {
                        "semantic_energy": uncertainty,
                        "survival_probability": survival_prob,
                        "logic_consistency": consistent,
                        "bloom_level": bloom_level,
                        "ciqs": ciqs,
                        "grade": grade_info["grade"],
                        "grade_label": grade_info["label"],
                        "grade_color": grade_info["color"],
                        "depth": session_daap.current_depth,
                        "is_collapsed": session_daap.is_collapsed(),
                        "status_code": status_info["status_code"],
                        "status_msg": status_info["status_msg"],
                        "reason": logic_reason 
                    }
                }))

                options = ["", ""]
                async def stream_option(option_idx, temperature):
                    nonlocal options
                    try:
                        stream = await client.chat.completions.create(
                            model="gpt-4o-mini",
                            messages=[{"role": "system", "content": probe_instruction}],
                            temperature=temperature,
                            max_tokens=200,
                            stream=True
                        )
                        async for chunk in stream:
                            if len(options[option_idx]) > 600:
                                break
                            delta = chunk.choices[0].delta.content or ""
                            if delta:
                                options[option_idx] += delta
                                await websocket.send_text(json.dumps({
                                    "type": "option_chunk",
                                    "index": option_idx,
                                    "content": delta
                                }))
                    except Exception as e:
                        print(f"Streaming error: {e}")

                await asyncio.gather(stream_option(0, 0.1), stream_option(1, 0.7))

                await websocket.send_text(json.dumps({
                    "type": "question_options_complete",
                    "options": options
                }))
                
                if session_daap.is_collapsed():
                    await websocket.send_text(json.dumps({
                        "type": "alert",
                        "content": f"[시스템 경고] {status_info['status_msg']}"
                    }))

            elif msg_type == "select":
                last_probe_content = content
                
    except WebSocketDisconnect:
        print(f"Client disconnected: {session_id}")
    except Exception as e:
        print(f"Error in WebSocket: {e}")
    finally:
        if session_id:
            # 개인정보 파기: ChromaDB 컬렉션 및 임시 파일 삭제
            rag_engine.delete_session_data(session_id)
            upload_path = f"./uploads/{session_id}"
            if os.path.exists(upload_path):
                import shutil
                shutil.rmtree(upload_path)
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

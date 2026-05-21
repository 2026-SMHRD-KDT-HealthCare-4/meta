import os
import uuid
import asyncio
from typing import List, Optional

import fitz  # PyMuPDF
from docx import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import chromadb
from chromadb.utils import embedding_functions
from openai import AsyncOpenAI
import pytesseract
from pdf2image import convert_from_path

class RAGEngine:
    def __init__(self, openai_api_key: str):
        self.client = AsyncOpenAI(api_key=openai_api_key)
        self.db_client = chromadb.PersistentClient(path="./chroma_db")
        self.embedding_function = embedding_functions.OpenAIEmbeddingFunction(
            api_key=openai_api_key,
            model_name="text-embedding-3-small"
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50
        )

    def extract_text_from_pdf(self, file_path: str) -> str:
        text = ""
        try:
            doc = fitz.open(file_path)
            for page in doc:
                text += page.get_text()
            doc.close()
        except Exception as e:
            print(f"PyMuPDF error: {e}")

        # Fallback to OCR if text is too short (likely image-based PDF)
        if len(text.strip()) < 50:
            print("PDF text extraction failed or too short. Falling back to OCR...")
            try:
                images = convert_from_path(file_path)
                ocr_text = ""
                for image in images:
                    ocr_text += pytesseract.image_to_string(image, lang='kor+eng')
                text = ocr_text
            except Exception as e:
                print(f"OCR error: {e}")
        
        return text

    def extract_text_from_docx(self, file_path: str) -> str:
        try:
            doc = Document(file_path)
            return "\n".join([para.text for para in doc.paragraphs])
        except Exception as e:
            print(f"DOCX error: {e}")
            return ""

    def extract_text_from_txt(self, file_path: str) -> str:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except UnicodeDecodeError:
            with open(file_path, 'r', encoding='cp949') as f:
                return f.read()
        except Exception as e:
            print(f"TXT error: {e}")
            return ""

    async def ingest_document(self, session_id: str, file_path: str, file_name: str):
        ext = os.path.splitext(file_name)[1].lower()
        if ext == '.pdf':
            text = self.extract_text_from_pdf(file_path)
        elif ext in ['.docx', '.doc']:
            text = self.extract_text_from_docx(file_path)
        elif ext == '.txt':
            text = self.extract_text_from_txt(file_path)
        else:
            return None

        if not text.strip():
            return None

        chunks = self.text_splitter.split_text(text)
        
        # Use session_id as collection name for isolation
        collection = self.db_client.get_or_create_collection(
            name=f"session_{session_id}",
            embedding_function=self.embedding_function
        )
        
        ids = [f"{session_id}_{i}" for i in range(len(chunks))]
        metadatas = [{"source": file_name} for _ in range(len(chunks))]
        
        collection.add(
            documents=chunks,
            ids=ids,
            metadatas=metadatas
        )
        return len(chunks)

    async def query(self, session_id: str, query_text: str, n_results: int = 3) -> str:
        try:
            collection = self.db_client.get_collection(
                name=f"session_{session_id}",
                embedding_function=self.embedding_function
            )
            results = collection.query(
                query_texts=[query_text],
                n_results=n_results
            )
            
            if results and results['documents']:
                return "\n---\n".join(results['documents'][0])
            return ""
        except Exception as e:
            print(f"RAG query error: {e}")
            return ""

    async def get_document_summary(self, session_id: str) -> str:
        """
        문서의 전체적인 맥락을 파악하기 위해 상위 랭크된 청크들을 모아 요약용 컨텍스트를 반환합니다.
        """
        try:
            collection = self.db_client.get_collection(
                name=f"session_{session_id}",
                embedding_function=self.embedding_function
            )
            # '이력서 전체 내용', '자기소개 요약' 등의 쿼리로 핵심 정보 추출 시도
            results = collection.query(
                query_texts=["지원자의 주요 경력, 기술 스택, 자기소개 핵심 내용"],
                n_results=5
            )
            if results and results['documents']:
                return "\n".join(results['documents'][0])
            return ""
        except Exception as e:
            print(f"Summary extraction error: {e}")
            return ""

    def delete_session_data(self, session_id: str):
        try:
            self.db_client.delete_collection(name=f"session_{session_id}")
            print(f"Deleted ChromaDB collection for session: {session_id}")
        except Exception as e:
            print(f"Error deleting collection: {e}")

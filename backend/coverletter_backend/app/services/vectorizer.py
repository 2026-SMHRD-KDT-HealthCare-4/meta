import os
import chromadb
from chromadb.utils import embedding_functions
from app.models.schemas import UserProfile
from typing import List

class UserDataVectorizer:
    def __init__(self):
        self.db_path = os.getenv("CHROMA_DB_PATH", "./chroma_db")
        self.client = chromadb.PersistentClient(path=self.db_path)
        
        # OpenAI embedding function
        self.openai_ef = embedding_functions.OpenAIEmbeddingFunction(
            api_key=os.getenv("OPENAI_API_KEY"),
            model_name="text-embedding-3-small"
        )
        
        self.collection = self.client.get_or_create_collection(
            name="user_profile",
            embedding_function=self.openai_ef
        )

    def process_and_store(self, user_id: str, profile: UserProfile):
        # Convert profile fields to textual chunks
        chunks = []
        metadatas = []
        ids = []

        # Define fields to vectorize
        fields = {
            "target_job": f"희망 직무: {profile.target_job}",
            "tech_stack": f"기술 스택: {', '.join(profile.tech_stack)}",
            "certifications": f"자격증: {', '.join(profile.certifications)}",
            "experience": f"주요 경험: {profile.experience}",
            "strength": f"강점: {profile.strength}",
            "motivation": f"지원 동기: {profile.motivation}"
        }

        for field_type, text in fields.items():
            # For simplicity, we'll treat each field as one chunk for now.
            # Large fields like 'experience' could be further chunked if needed.
            chunks.append(text)
            metadatas.append({"user_id": user_id, "field_type": field_type})
            ids.append(f"{user_id}_{field_type}")

        # Upsert into ChromaDB
        self.collection.upsert(
            documents=chunks,
            metadatas=metadatas,
            ids=ids
        )
        return len(chunks)

    def query_experience(self, user_id: str, query_text: str, n_results: int = 5):
        results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where={"user_id": user_id}
        )
        return results

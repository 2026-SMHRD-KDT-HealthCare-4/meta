from app.services.vectorizer import UserDataVectorizer
from app.models.schemas import JDContext
from typing import List

class RAGRetriever:
    def __init__(self, vectorizer: UserDataVectorizer):
        self.vectorizer = vectorizer

    def retrieve_relevant_experience(self, user_id: str, jd_context: JDContext, top_k: int = 5):
        # We use the top keywords from the JD context to query the user's experience
        query_text = " ".join([kw.keyword for kw in jd_context.keywords[:5]])
        
        # Add the job name to the query
        query_text = f"{jd_context.job_name} {query_text}"
        
        results = self.vectorizer.query_experience(
            user_id=user_id,
            query_text=query_text,
            n_results=top_k
        )
        
        # Format the results for the prompt
        retrieved_chunks = []
        if results and 'documents' in results and results['documents']:
            documents = results['documents'][0]
            metadatas = results['metadatas'][0]
            distances = results['distances'][0] if 'distances' in results else [0] * len(documents)
            
            for doc, meta, dist in zip(documents, metadatas, distances):
                # dist is typically cosine distance (1 - similarity)
                # Lower distance means higher similarity
                similarity = 1 - dist
                if similarity >= 0.3: # Threshold
                    retrieved_chunks.append({
                        "content": doc,
                        "field_type": meta.get("field_type"),
                        "similarity": similarity
                    })
        
        return retrieved_chunks

    def build_final_context(self, jd_context: JDContext, relevant_experience: List[dict]):
        context = f"지원 직무 정보:\n{jd_context.context}\n\n"
        context += "관련된 사용자 경험 및 역량:\n"
        
        for i, exp in enumerate(relevant_experience):
            context += f"[{i+1}] ({exp['field_type']}) {exp['content']}\n"
            
        return context

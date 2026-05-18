# AI Metacognition Interviewer Evaluation Console

This project implements a **Candidate Monitoring Station** for interviewers, using Domain-Agnostic Adaptive Probing (DAAP) to evaluate a candidate's metacognition in real-time.

## Features for Interviewers
- **Real-time Candidate Monitoring:** Track survival probability, semantic uncertainty, and Bloom's taxonomy level as the candidate responds.
- **AI-Assisted Probing:** The system suggests piercing Socratic probes based on the candidate's last statement to test their logical boundaries.
- **Logical Inconsistency Detection:** Built-in SMT solver (Z3) integration to flag structural contradictions in the candidate's reasoning.
- **Cognitive Collapse Alerts:** Immediate notification when a candidate's cognitive load or logical integrity fails beyond repair.

## Tech Stack
- **Frontend:** Next.js, TailwindCSS, Recharts.
- **Backend:** FastAPI, Z3-solver, OpenAI GPT-4o-mini.

## Setup Instructions

### 1. Backend Setup
1. Navigate to the `backend` folder.
2. Create a `.env` file from `.env.example` and add your `OPENAI_API_KEY`.
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the server:
   ```bash
   python main.py
   ```

### 2. Frontend Setup
1. Navigate to the `frontend` folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Usage
- Open `http://localhost:3000` in your browser.
- Start an interview by typing a topic.
- Observe real-time metacognitive metrics on the sidebar.
- If logical inconsistencies are detected or survival probability drops below 20%, the session will terminate.

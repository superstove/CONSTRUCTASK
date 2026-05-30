from fastapi import APIRouter

from ai_engine import ask_constructask
from schemas import ChatRequest, ChatResponse


router = APIRouter()


@router.post("/", response_model=ChatResponse)
def chat(request: ChatRequest):
    result = ask_constructask(request.question, request.project_id)
    return ChatResponse(
        answer=result.answer,
        question=request.question,
        project_id=request.project_id,
        data_used=result.data_used,
        mode=result.mode,
        reasoning_sources=result.reasoning_sources,
        confidence=result.confidence,
    )

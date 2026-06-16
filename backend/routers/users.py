from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user, require_role
from database import get_db
from models import User
from schemas import UserCreate, UserOut

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[UserOut])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Strictly return only the currently authenticated user to ensure total account isolation.
    return [current_user]


@router.post("/", response_model=UserOut, dependencies=[Depends(require_role("Admin", "Project Manager"))])
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = User(name=user.name, email=user.email, role=user.role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.put("/{user_id}", response_model=UserOut, dependencies=[Depends(require_role("Admin", "Project Manager"))])
def update_user(user_id: int, user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.name = user.name
    db_user.email = user.email
    db_user.role = user.role
    
    db.commit()
    db.refresh(db_user)
    return db_user


@router.delete("/{user_id}", dependencies=[Depends(require_role("Admin", "Project Manager"))])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(db_user)
    db.commit()
    return {"message": "User deleted successfully"}

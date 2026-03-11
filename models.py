from pydantic import BaseModel
from typing import Optional

class Record(BaseModel):
    slip_no: str
    date: str
    waste_type: str
    amount: float
    carrier: str = ""
    vehicle_no: str = ""
    processor: str = ""
    note1: str = ""
    note2: str = ""
    category: str = ""
    supplier: str = "공장"
    status: str = "completed"

class StatusUpdate(BaseModel):
    status: str

class Schedule(BaseModel):
    date: str
    content: str
    status: Optional[str] = "pending"

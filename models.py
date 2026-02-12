# -*- coding: utf-8 -*-
from pydantic import BaseModel
from typing import List, Optional

class Record(BaseModel):
    id: Optional[int] = None
    slip_no: str
    date: str
    waste_type: str
    amount: float
    carrier: Optional[str] = ""
    vehicle_no: Optional[str] = ""
    processor: Optional[str] = ""
    note1: Optional[str] = ""
    note2: Optional[str] = ""
    category: Optional[str] = ""
    supplier: Optional[str] = ""
    status: Optional[str] = "completed"

class StatusUpdate(BaseModel):
    status: str

class Schedule(BaseModel):
    id: Optional[int] = None
    date: str
    content: str
    status: Optional[str] = "pending"

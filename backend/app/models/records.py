from datetime import date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Sale(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    date: date
    customer: str = Field(default="-", min_length=1, max_length=150)
    product: str = Field(min_length=1, max_length=150)
    quantity: int = Field(ge=1, le=1000000)
    price: Decimal = Field(
        ge=0, le=1000000000000, decimal_places=2, allow_inf_nan=False
    )
    unit_cost: Decimal = Field(
        ge=0, le=1000000000000, decimal_places=2, allow_inf_nan=False
    )
    category: str | None = Field(default=None, max_length=150)
    location: str | None = Field(default=None, max_length=150)

    @field_validator("quantity", "price", "unit_cost", mode="before")
    @classmethod
    def reject_booleans(cls, value):
        if isinstance(value, bool):
            raise ValueError("Nilai angka tidak boleh boolean.")
        return value


class Expense(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    date: date
    description: str = Field(min_length=1, max_length=150)
    amount: Decimal = Field(
        ge=0, le=1000000000000, decimal_places=2, allow_inf_nan=False
    )


class Filters(BaseModel):
    year: int | None = Field(default=None, ge=1, le=9999)
    month: int | None = Field(default=None, ge=1, le=12)
    start: date | None = None
    end: date | None = None
    product: str = ""
    category: str = ""
    location: str = ""

    @field_validator("end")
    @classmethod
    def valid_range(cls, value, info):
        if value and info.data.get("start") and value < info.data["start"]:
            raise ValueError("Tanggal akhir harus setelah tanggal awal.")
        return value

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    Text,
    DateTime,
    Boolean,
    ForeignKey,
    UniqueConstraint
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship 

from database import Base


# -------------------------
# EXPENSE CATEGORY MODEL
# -------------------------
class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, index=True)

    company_id = Column(  Integer,nullable=False,index=True)
      
    name = Column(String,nullable=False,  index=True )
        
    is_default = Column( Boolean, default=False )
       
    __table_args__ = (
        UniqueConstraint( "company_id","name", name="uq_category_company_name"),
    )


# -------------------------
# EXPENSE MODEL
# -------------------------
class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)

    company_id = Column( Integer, nullable=False, index=True )
    
    expense_date = Column(Date, nullable=False,  index=True )
        
    category_id = Column(
        Integer,
        ForeignKey("expense_categories.id", ondelete="RESTRICT" ),
        nullable=False,
        index=True
    )

    amount = Column(Float,nullable=False,default=0.0)
        
    payment_method = Column( String,nullable=False,default="CASH")
       
    description = Column(Text, nullable=True)

    employee_name = Column(String, nullable=True)
    designation = Column(String, nullable=True)

    vendor_name = Column(String, nullable=True)
    receipt_number = Column(String, nullable=True)

    status = Column( String,default="PENDING",index=True )
       
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        onupdate=func.now()
    )

    category_rel = relationship("ExpenseCategory", lazy="selectin")
    @property
    def category(self):
        return self.category_rel.name if self.category_rel else None
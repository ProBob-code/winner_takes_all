import sys
import os

# Add apps/api to path so we can import app
sys.path.append(os.getcwd())

from app.db.models import Base
from sqlalchemy import create_mock_engine

def dump(sql, *multiparams, **params):
    print(sql.compile(dialect=engine.dialect))

engine = create_mock_engine('sqlite://', dump)
Base.metadata.create_all(engine)

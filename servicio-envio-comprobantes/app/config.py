import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL = os.getenv("DATABASE_URL", "")
    APP_PORT = int(os.getenv("APP_PORT", "3026"))

    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

    TICKET_SERVICE_URL = os.getenv(
        "TICKET_SERVICE_URL",
        "http://localhost:3025"
    )

    CORS_ORIGINS = [
        x.strip()
        for x in os.getenv("CORS_ORIGINS", "").split(",")
        if x.strip()
    ]

settings = Settings()
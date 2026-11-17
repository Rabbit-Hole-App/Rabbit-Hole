"""Secret redaction before any repository text reaches the model. Ported from packages/web/src/learn-codebase-goals.js (SECRET_NAME, SECRET_TEXT)."""
import re

SECRET_NAME = re.compile(r'(^|/)(\.env(\.[\w-]+)?|[\w.-]+\.(pem|key|p12|pfx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)|credentials(\.[a-z]+)?|secrets?(\.[a-z]+)?|[\w-]+\.secrets?\.[a-z]+)$', re.I)
SECRET_TEXT = re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}|\bsk-[A-Za-z0-9_-]{20,}')


def redact_file(path: str, text: str) -> str:
    """A secret-named file is withheld whole; elsewhere each matching span is replaced."""
    if SECRET_NAME.search(path):
        return '[withheld: secret-named file]'
    return SECRET_TEXT.sub('[redacted]', text)


def redact_text(text: str) -> str:
    return SECRET_TEXT.sub('[redacted]', text)

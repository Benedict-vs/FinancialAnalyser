import csv
import hashlib
import io
import json
import re
from datetime import datetime, date as date_cls, time as time_cls
from typing import Iterator, Optional


def _parse_amount(s: str) -> float:
    if s is None:
        return 0.0
    s = s.strip().replace(" ", "").replace(" ", "")
    if not s:
        return 0.0
    # German format: "-1.234,56" -> "-1234.56"
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_date(s: str) -> Optional[date_cls]:
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_time(s: str) -> Optional[time_cls]:
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            continue
    return None


def _hash(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def parse_paypal(file_bytes: bytes) -> list[dict]:
    text = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    out: list[dict] = []
    for row in reader:
        status = (row.get("Status") or "").strip()
        if status and status != "Abgeschlossen":
            continue
        d = _parse_date(row.get("Datum") or "")
        if not d:
            continue
        t = _parse_time(row.get("Uhrzeit") or "")
        amount = _parse_amount(row.get("Brutto") or row.get("Netto") or "0")
        fee = _parse_amount(row.get("Gebühr") or "0")
        counterparty = (row.get("Name") or "").strip()
        description = (row.get("Betreff") or "").strip()
        note = (row.get("Hinweis") or "").strip() or None
        currency = (row.get("Währung") or "EUR").strip() or "EUR"
        txid = (row.get("Transaktionscode") or "").strip() or None

        impact = (row.get("Auswirkung auf Guthaben") or "").strip()
        if impact == "Soll" and amount > 0:
            amount = -amount
        elif impact == "Haben" and amount < 0:
            amount = abs(amount)

        out.append({
            "date": d,
            "time": t,
            "amount": amount,
            "fee": fee,
            "currency": currency,
            "counterparty": counterparty,
            "description": description,
            "note": note,
            "paypal_transaction_id": txid,
            "dedup_hash": txid or _hash(d.isoformat(), f"{amount:.2f}", counterparty, description),
            "raw": json.dumps(row, ensure_ascii=False),
        })
    return out


def parse_sparkasse(file_bytes: bytes) -> list[dict]:
    # Sparkasse exports vary slightly; try latin-1 fallback
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = file_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = file_bytes.decode("utf-8", errors="replace")

    # Detect delimiter
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    out: list[dict] = []
    for row in reader:
        # Try common Sparkasse column names
        date_str = (
            row.get("Buchungstag")
            or row.get("Buchung")
            or row.get("Valutadatum")
            or row.get("Date")
            or ""
        )
        d = _parse_date(date_str)
        if not d:
            continue
        counterparty = (
            row.get("Auftraggeber/Beguenstigter")
            or row.get("Beguenstigter/Zahlungspflichtiger")
            or row.get("Auftraggeber/Empfaenger")
            or row.get("Beguenstigter")
            or row.get("Name")
            or ""
        ).strip()
        description = (
            row.get("Verwendungszweck")
            or row.get("Buchungstext")
            or row.get("Description")
            or ""
        ).strip()
        amount = _parse_amount(row.get("Betrag") or row.get("Amount") or "0")
        currency = (row.get("Waehrung") or row.get("Währung") or "EUR").strip() or "EUR"
        sparkasse_kategorie = (row.get("Kategorie") or "").strip() or None

        needs_paypal = bool(re.search(r"paypal", counterparty, re.IGNORECASE)) or bool(re.search(r"paypal", description, re.IGNORECASE))

        out.append({
            "date": d,
            "time": None,
            "amount": amount,
            "fee": 0.0,
            "currency": currency,
            "counterparty": counterparty,
            "description": description,
            "note": None,
            "needs_paypal_enrichment": needs_paypal,
            "sparkasse_kategorie": sparkasse_kategorie,
            "dedup_hash": _hash(d.isoformat(), f"{amount:.2f}", counterparty, description),
            "raw": json.dumps(row, ensure_ascii=False),
        })
    return out


def parse_generic(file_bytes: bytes, mapping: dict) -> list[dict]:
    """mapping: {date: 'colname', amount: 'colname', counterparty: 'colname', ...}"""
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = file_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = file_bytes.decode("utf-8", errors="replace")
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    out: list[dict] = []
    for row in reader:
        d = _parse_date(row.get(mapping.get("date", "")) or "")
        if not d:
            continue
        amount = _parse_amount(row.get(mapping.get("amount", "")) or "0")
        counterparty = (row.get(mapping.get("counterparty", "")) or "").strip()
        description = (row.get(mapping.get("description", "")) or "").strip()
        currency = (row.get(mapping.get("currency", "")) or "EUR").strip() or "EUR"
        out.append({
            "date": d,
            "time": _parse_time(row.get(mapping.get("time", "")) or ""),
            "amount": amount,
            "fee": 0.0,
            "currency": currency,
            "counterparty": counterparty,
            "description": description,
            "note": None,
            "dedup_hash": _hash(d.isoformat(), f"{amount:.2f}", counterparty, description),
            "raw": json.dumps(row, ensure_ascii=False),
        })
    return out


def sniff_columns(file_bytes: bytes) -> list[str]:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = file_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = file_bytes.decode("utf-8", errors="replace")
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        return next(reader)
    except StopIteration:
        return []

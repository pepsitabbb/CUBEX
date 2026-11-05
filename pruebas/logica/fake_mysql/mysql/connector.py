"""Simulación de mysql.connector sobre sqlite3 (solo para pruebas)."""
import os
import re
import sqlite3
from datetime import datetime

class Error(Exception):
    pass

class IntegrityError(Error):
    pass

class ProgrammingError(Error):
    pass

_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$")

def _traducir(sql):
    sql = sql.replace("%s", "?")
    sql = re.sub(r"FOR UPDATE", "", sql, flags=re.I)
    sql = re.sub(r"NOW\(\)", "datetime('now','localtime')", sql, flags=re.I)
    sql = re.sub(r"CAST\(([^)]+?) AS CHAR\)", r"CAST(\1 AS TEXT)", sql, flags=re.I)
    return sql

def _valor(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    return v

def _convertir(v):
    if isinstance(v, str) and _FECHA.match(v):
        return datetime.strptime(v[:19], "%Y-%m-%d %H:%M:%S")
    return v

class Cursor:
    def __init__(self, conn, dictionary):
        self.conn = conn
        self.dictionary = dictionary
        self.lastrowid = None
        self._filas = []

    def execute(self, sql, params=()):
        try:
            cur = self.conn._db.execute(_traducir(sql), tuple(_valor(p) for p in (params or ())))
        except sqlite3.IntegrityError as error:
            if "CHECK" in str(error):
                raise Error(str(error))
            raise IntegrityError(str(error))
        except sqlite3.Error as error:
            raise Error(f"{error} :: {sql[:120]}")
        self.lastrowid = cur.lastrowid
        if cur.description:
            nombres = [d[0] for d in cur.description]
            filas = cur.fetchall()
            if self.dictionary:
                self._filas = [{n: _convertir(v) for n, v in zip(nombres, f)} for f in filas]
            else:
                self._filas = [tuple(_convertir(v) for v in f) for f in filas]
        else:
            self._filas = []

    def fetchone(self):
        return self._filas.pop(0) if self._filas else None

    def fetchall(self):
        filas, self._filas = self._filas, []
        return filas

    def close(self):
        pass

class Conexion:
    def __init__(self, **cfg):
        self._db = sqlite3.connect(os.environ["SQLITE_DB"], timeout=10, isolation_level=None)
        self._db.execute("PRAGMA foreign_keys = ON")
        self.en_tx = False

    def cursor(self, dictionary=False):
        return Cursor(self, dictionary)

    def start_transaction(self, isolation_level=None):
        if self.en_tx:
            raise ProgrammingError("Transaction already in progress")
        self._db.execute("BEGIN IMMEDIATE")
        self.en_tx = True

    def commit(self):
        if self.en_tx:
            self._db.execute("COMMIT")
        self.en_tx = False

    def rollback(self):
        if self.en_tx:
            self._db.execute("ROLLBACK")
        self.en_tx = False

    def is_connected(self):
        return True

    def close(self):
        if self.en_tx:
            self.rollback()
        self._db.close()

def connect(**cfg):
    return Conexion(**cfg)

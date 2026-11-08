import ast
import io
import math
import json
import re
import decimal
import fractions
import statistics
import datetime
import collections
import itertools
import functools
import random
import concurrent.futures
import logging
from typing import Dict, Any, Set

logger = logging.getLogger("synaptix.security.sandbox")

MAX_CODE_LENGTH = 8000
MAX_AST_NODES = 600
MAX_OUTPUT_CHARS = 16000
EXECUTION_TIMEOUT_SECONDS = 5.0

ALLOWED_MODULES: Dict[str, Any] = {
    "math": math,
    "statistics": statistics,
    "decimal": decimal,
    "fractions": fractions,
    "datetime": datetime,
    "json": json,
    "re": re,
    "collections": collections,
    "itertools": itertools,
    "functools": functools,
    "random": random,
}

FORBIDDEN_NAMES: Set[str] = {
    "eval",
    "exec",
    "compile",
    "open",
    "input",
    "breakpoint",
    "help",
    "dir",
    "vars",
    "locals",
    "globals",
    "getattr",
    "setattr",
    "delattr",
    "hasattr",
    "type",
    "super",
    "memoryview",
    "classmethod",
    "staticmethod",
    "property",
    "__import__",
    "__builtins__",
    "__loader__",
    "__spec__",
    "__package__",
    "__file__",
    "__name__",
    "exit",
    "quit",
    "copyright",
    "credits",
    "license",
}

FORBIDDEN_AST_TYPES = (
    ast.AsyncFunctionDef,
    ast.AsyncFor,
    ast.AsyncWith,
    ast.Await,
    ast.Global,
    ast.Nonlocal,
    ast.Yield,
    ast.YieldFrom,
    ast.Delete,
)


class SandboxSecurityViolation(Exception):
    """Exceção lançada quando o código viola as políticas do Sandbox AST."""
    pass


class SafeASTValidator(ast.NodeVisitor):
    """
    Validador estático de árvore sintática abstrata (AST) que bloqueia:
    - Importação de qualquer módulo fora da whitelist matemática/analítica
    - Acesso a atributos ou identificadores privados/dunder (iniciados por '_')
    - Chamadas a builtins perigosos (open, exec, eval, getattr, type, etc.)
    - Bombas de exponenciação ou árvores excessivamente complexas
    """

    def __init__(self):
        self.node_count = 0

    def generic_visit(self, node: ast.AST):
        self.node_count += 1
        if self.node_count > MAX_AST_NODES:
            raise SandboxSecurityViolation(
                f"Complexidade do código excedeu o limite de segurança ({MAX_AST_NODES} nós AST)."
            )
        if isinstance(node, FORBIDDEN_AST_TYPES):
            raise SandboxSecurityViolation(
                f"Construção sintática não permitida no Sandbox seguro: {type(node).__name__}"
            )
        super().generic_visit(node)

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            root_mod = alias.name.split(".")[0]
            if root_mod not in ALLOWED_MODULES:
                raise SandboxSecurityViolation(
                    f"Importação do módulo '{alias.name}' bloqueada pelo Sandbox Zero-Trust. "
                    f"Módulos permitidos: {', '.join(sorted(ALLOWED_MODULES.keys()))}"
                )
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if not node.module:
            raise SandboxSecurityViolation("Importação relativa não permitida no Sandbox.")
        root_mod = node.module.split(".")[0]
        if root_mod not in ALLOWED_MODULES:
            raise SandboxSecurityViolation(
                f"Importação a partir de '{node.module}' bloqueada pelo Sandbox Zero-Trust. "
                f"Módulos permitidos: {', '.join(sorted(ALLOWED_MODULES.keys()))}"
            )
        for alias in node.names:
            if alias.name == "*" or alias.name.startswith("_"):
                raise SandboxSecurityViolation(
                    f"Importação de '{alias.name}' não permitida no Sandbox."
                )
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name):
        if node.id.startswith("_"):
            raise SandboxSecurityViolation(
                f"Identificador iniciado por '_' ('{node.id}') é bloqueado no Sandbox."
            )
        if node.id in FORBIDDEN_NAMES:
            raise SandboxSecurityViolation(
                f"Uso de '{node.id}' é bloqueado no Sandbox por motivos de segurança."
            )
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        if node.attr.startswith("_"):
            raise SandboxSecurityViolation(
                f"Acesso ao atributo privado/interno '{node.attr}' é bloqueado no Sandbox."
            )
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        if node.name.startswith("_"):
            raise SandboxSecurityViolation(
                f"Definição de função iniciada por '_' ('{node.name}') não permitida."
            )
        for arg in node.args.args + node.args.kwonlyargs:
            if arg.arg.startswith("_"):
                raise SandboxSecurityViolation(
                    f"Parâmetro iniciado por '_' ('{arg.arg}') não permitido."
                )
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        raise SandboxSecurityViolation(
            "Definição de classes customizadas não é permitida no Sandbox analítico."
        )

    def visit_BinOp(self, node: ast.BinOp):
        # Proteção contra bombas de CPU/memória por exponenciação ou deslocamento de bits
        if isinstance(node.op, ast.Pow):
            if isinstance(node.right, ast.Constant) and isinstance(node.right.value, (int, float)):
                if abs(node.right.value) > 1000:
                    raise SandboxSecurityViolation("Expoente numérico excede o limite seguro (1000).")
        if isinstance(node.op, ast.LShift):
            if isinstance(node.right, ast.Constant) and isinstance(node.right.value, int):
                if node.right.value > 256:
                    raise SandboxSecurityViolation("Deslocamento de bits excede o limite seguro (256).")
        self.generic_visit(node)


def _safe_import(name: str, globals=None, locals=None, fromlist=(), level=0):
    if level != 0:
        raise SandboxSecurityViolation("Importações relativas são bloqueadas.")
    root_mod = name.split(".")[0]
    if root_mod not in ALLOWED_MODULES:
        raise SandboxSecurityViolation(f"Módulo '{name}' não autorizado no Sandbox.")
    return ALLOWED_MODULES[root_mod]


def _safe_range(*args):
    r = range(*args)
    if len(r) > 100_000:
        raise SandboxSecurityViolation("Intervalo range() excede o limite máximo de 100.000 iterações.")
    return r


def _safe_pow(base, exp, mod=None):
    if isinstance(exp, (int, float)) and abs(exp) > 1000:
        raise SandboxSecurityViolation("Expoente em pow() excede o limite seguro (1000).")
    return pow(base, exp, mod) if mod is not None else pow(base, exp)


def _execute_validated_ast(compiled_code, source_info: str) -> Dict[str, Any]:
    output_buffer = io.StringIO()

    def _safe_print(*args, **kwargs):
        sep = kwargs.get("sep", " ")
        end = kwargs.get("end", "\n")
        text = sep.join(str(a) for a in args) + end
        if output_buffer.tell() + len(text) > MAX_OUTPUT_CHARS:
            raise SandboxSecurityViolation("Saída de texto excedeu o limite máximo de 16 KB.")
        output_buffer.write(text)

    safe_builtins = {
        "abs": abs,
        "all": all,
        "any": any,
        "bool": bool,
        "chr": chr,
        "dict": dict,
        "divmod": divmod,
        "enumerate": enumerate,
        "filter": filter,
        "float": float,
        "format": format,
        "frozenset": frozenset,
        "hex": hex,
        "int": int,
        "isinstance": isinstance,
        "len": len,
        "list": list,
        "map": map,
        "max": max,
        "min": min,
        "next": next,
        "oct": oct,
        "ord": ord,
        "pow": _safe_pow,
        "print": _safe_print,
        "range": _safe_range,
        "repr": repr,
        "reversed": reversed,
        "round": round,
        "set": set,
        "slice": slice,
        "sorted": sorted,
        "str": str,
        "sum": sum,
        "tuple": tuple,
        "zip": zip,
        "True": True,
        "False": False,
        "None": None,
        "ValueError": ValueError,
        "TypeError": TypeError,
        "ZeroDivisionError": ZeroDivisionError,
        "KeyError": KeyError,
        "IndexError": IndexError,
        "Exception": Exception,
        "__import__": _safe_import,
    }

    sandbox_globals: Dict[str, Any] = {
        "__builtins__": safe_builtins,
        **ALLOWED_MODULES,
    }
    sandbox_locals: Dict[str, Any] = {}

    exec(compiled_code, sandbox_globals, sandbox_locals)
    return {
        "success": True,
        "stdout": output_buffer.getvalue(),
        "stderr": "",
        "exit_code": 0,
    }


def run_code_analysis(code: str) -> dict:
    """
    Executa cálculos matemáticos, estatísticos e análise de dados em um
    Sandbox AST seguro em memória (sem acesso a arquivos, sistema operacional ou rede).
    O código fornecido DEVE usar print() para exibir os resultados.
    """
    if not code or not isinstance(code, str):
        return {"success": False, "error": "Código vazio ou inválido.", "stderr": "", "exit_code": 1}

    if len(code) > MAX_CODE_LENGTH:
        return {
            "success": False,
            "error": f"Código excede o tamanho máximo permitido ({MAX_CODE_LENGTH} caracteres).",
            "stderr": "",
            "exit_code": 1,
        }

    try:
        tree = ast.parse(code, filename="<synaptix_ast_sandbox>", mode="exec")
        validator = SafeASTValidator()
        validator.visit(tree)
        compiled = compile(tree, filename="<synaptix_ast_sandbox>", mode="exec")
    except SandboxSecurityViolation as sec_err:
        logger.warning(f"Bloqueio de segurança no Sandbox AST: {sec_err}")
        return {
            "success": False,
            "error": "Violação de Segurança do Sandbox",
            "stderr": str(sec_err),
            "exit_code": 1,
        }
    except SyntaxError as syn_err:
        return {
            "success": False,
            "error": "Erro de Sintaxe Python",
            "stderr": f"Linha {syn_err.lineno}: {syn_err.msg}",
            "exit_code": 1,
        }

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_execute_validated_ast, compiled, code)
            return future.result(timeout=EXECUTION_TIMEOUT_SECONDS)
    except concurrent.futures.TimeoutExpired:
        return {
            "success": False,
            "error": "Timeout",
            "stderr": f"A execução excedeu o limite seguro de {EXECUTION_TIMEOUT_SECONDS} segundos.",
            "exit_code": 124,
        }
    except SandboxSecurityViolation as sec_err:
        logger.warning(f"Bloqueio em tempo de execução no Sandbox AST: {sec_err}")
        return {
            "success": False,
            "error": "Violação de Segurança do Sandbox",
            "stderr": str(sec_err),
            "exit_code": 1,
        }
    except Exception as e:
        return {
            "success": False,
            "error": type(e).__name__,
            "stderr": str(e),
            "exit_code": 1,
        }

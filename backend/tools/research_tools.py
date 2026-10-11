import subprocess
import tempfile
import os

def run_code_analysis(code: str) -> dict:
    """
    Executa codigo Python em um processo isolado local.
    Pode ser usado para analisar dados, calcular valores ou gerar resultados complexos.
    O codigo fornecido DEVE dar 'print' nos resultados finais para que a IA possa ler.
    """
    try:
        # Create a temporary python file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
            f.write(code)
            temp_script = f.name

        # Execute the temporary script
        result = subprocess.run(
            ["python", temp_script],
            capture_output=True,
            text=True,
            timeout=30 # Limit execution to 30 seconds
        )

        # Cleanup the temporary file
        try:
            os.remove(temp_script)
        except:
            pass

        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timeout", "stderr": "A execução do código excedeu o limite de 30 segundos."}
    except Exception as e:
        return {"success": False, "error": str(e)}

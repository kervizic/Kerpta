@echo off
chcp 65001 >nul 2>&1
title PaddleX OCR Serving - Kerpta
echo ============================================
echo   PaddleX OCR Serving - Kerpta
echo ============================================
echo.

:: Desactiver la verification de connectivite (accelere le demarrage)
set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

:: ----------------------------------------------------------------
:: Etape 1 - Verifier Python
:: ----------------------------------------------------------------
python --version >nul 2>&1
if %errorlevel% neq 0 goto :no_python
echo [OK] Python trouve.
goto :check_paddle

:no_python
echo [ERREUR] Python non trouve. Installez Python 3.10+ et ajoutez-le au PATH.
goto :fin

:: ----------------------------------------------------------------
:: Etape 2 - Installer paddlepaddle-gpu 3.0+
:: PaddleX 3.4 necessite PaddlePaddle >= 3.0.0
:: La version PyPI (2.6.2) cause l'erreur "set_optimization_level"
:: ----------------------------------------------------------------
:check_paddle
python -c "import paddle; v=paddle.__version__; exit(0 if int(v.split('.')[0]) >= 3 else 1)" >nul 2>&1
if %errorlevel% equ 0 goto :paddle_ok

echo [INFO] Installation de paddlepaddle-gpu 3.0+ depuis le repo officiel...
echo [INFO] Desinstallation de l'ancienne version...
pip uninstall -y paddlepaddle paddlepaddle-gpu >nul 2>&1

echo [INFO] Installation de la derniere version paddlepaddle-gpu (CUDA 11.8)...
pip install paddlepaddle-gpu -i https://www.paddlepaddle.org.cn/packages/stable/cu118/
if %errorlevel% equ 0 goto :paddle_ok

echo [WARN] CUDA 11.8 echoue, tentative CUDA 12.6...
pip install paddlepaddle-gpu -i https://www.paddlepaddle.org.cn/packages/stable/cu126/
if %errorlevel% equ 0 goto :paddle_ok

echo [WARN] GPU echoue, installation CPU...
pip install paddlepaddle -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
if %errorlevel% neq 0 goto :paddle_fail
goto :paddle_ok

:paddle_fail
echo [ERREUR] Impossible d'installer PaddlePaddle.
goto :fin

:paddle_ok
echo [OK] PaddlePaddle 3.0+ pret.

:: ----------------------------------------------------------------
:: Etape 3 - Installer PaddleX si absent
:: ----------------------------------------------------------------
python -c "import paddlex" >nul 2>&1
if %errorlevel% equ 0 goto :paddlex_ok

echo [INFO] Installation de PaddleX...
pip install paddlex==3.4.2
if %errorlevel% neq 0 goto :paddlex_fail
goto :paddlex_ok

:paddlex_fail
echo [ERREUR] Echec installation paddlex.
goto :fin

:paddlex_ok
echo [OK] PaddleX pret.

:: ----------------------------------------------------------------
:: Etape 4 - Installer le plugin serving
:: ----------------------------------------------------------------
echo [INFO] Verification du plugin serving...
paddlex --install serving
echo [OK] Plugin serving pret.

:: ----------------------------------------------------------------
:: Etape 5 - Detecter GPU et demarrer
:: ----------------------------------------------------------------
echo.
set DEVICE=cpu
python -c "import paddle; exit(0 if paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0 else 1)" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] GPU detecte
    set DEVICE=gpu
) else (
    echo [INFO] Pas de GPU, demarrage en CPU.
)

echo.
echo ============================================
echo   Device : %DEVICE%
echo   Endpoint : http://0.0.0.0:12321/layout-parsing
echo   Ctrl+C pour arreter
echo ============================================
echo.

paddlex --serve --pipeline PaddleOCR-VL --device %DEVICE% --host 0.0.0.0 --port 12321

echo.
echo [INFO] PaddleX s'est arrete.
goto :fin

:fin
echo.
echo Appuyez sur une touche pour fermer...
pause >nul

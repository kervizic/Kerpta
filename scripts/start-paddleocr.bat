@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title PaddleX OCR Serving - Kerpta
echo ============================================
echo   PaddleX OCR Serving - Kerpta
echo ============================================
echo.

:: Desactiver la verification de connectivite
set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

:: ================================================================
:: Etape 1 - Verifier Python
:: ================================================================
echo [1/5] Verification de Python...
python --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERREUR] Python non trouve. Installez Python 3.10+
    goto :fin
)
echo [OK] Python trouve.

:: ================================================================
:: Etape 2 - PaddlePaddle GPU 3.0+
:: ================================================================
echo.
echo [2/5] Verification de PaddlePaddle...
python -c "import paddle; v=paddle.__version__; print('  Version actuelle:', v); exit(0 if int(v.split('.')[0]) >= 3 else 1)" 2>nul
if !errorlevel! equ 0 (
    echo [OK] PaddlePaddle 3.0+ deja installe.
    goto :step3
)

echo [INFO] Installation de paddlepaddle-gpu 3.0+...
pip uninstall -y paddlepaddle paddlepaddle-gpu >nul 2>&1
echo [INFO] Telechargement depuis le repo officiel Paddle (CUDA 11.8)...
pip install paddlepaddle-gpu -i https://www.paddlepaddle.org.cn/packages/stable/cu118/
if !errorlevel! equ 0 goto :step3

echo [WARN] CUDA 11.8 echoue, tentative CUDA 12.6...
pip install paddlepaddle-gpu -i https://www.paddlepaddle.org.cn/packages/stable/cu126/
if !errorlevel! equ 0 goto :step3

echo [WARN] GPU echoue, installation CPU...
pip install paddlepaddle -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
if !errorlevel! neq 0 (
    echo [ERREUR] Impossible d'installer PaddlePaddle.
    goto :fin
)

:step3
:: ================================================================
:: Etape 3 - PaddleX
:: ================================================================
echo.
echo [3/5] Verification de PaddleX...
python -c "import paddlex; print('  Version:', paddlex.__version__)" 2>nul
if !errorlevel! equ 0 (
    echo [OK] PaddleX deja installe.
    goto :step4
)

echo [INFO] Installation de PaddleX 3.4.2...
pip install paddlex==3.4.2
if !errorlevel! neq 0 (
    echo [ERREUR] Echec installation PaddleX.
    goto :fin
)
echo [OK] PaddleX installe.

:step4
:: ================================================================
:: Etape 4 - Plugin serving
:: ================================================================
echo.
echo [4/5] Plugin serving...
paddlex --install serving
echo [OK] Plugin serving pret.

:: ================================================================
:: Etape 5 - Detection GPU et demarrage
:: ================================================================
echo.
echo [5/5] Detection GPU...
set DEVICE=cpu
python -c "import paddle; g=paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count()>0; print('  GPU disponible:', g); exit(0 if g else 1)" 2>nul
if !errorlevel! equ 0 (
    set DEVICE=gpu
    echo [OK] Demarrage en GPU.
) else (
    echo [INFO] Pas de GPU detecte, demarrage en CPU.
)

echo.
echo ============================================
echo   Device : !DEVICE!
echo   Endpoint : http://0.0.0.0:12321/layout-parsing
echo   Ctrl+C pour arreter
echo ============================================
echo.

paddlex --serve --pipeline PaddleOCR-VL --device !DEVICE! --host 0.0.0.0 --port 12321

echo.
echo [INFO] PaddleX s'est arrete.

:fin
echo.
echo Appuyez sur une touche pour fermer...
pause >nul

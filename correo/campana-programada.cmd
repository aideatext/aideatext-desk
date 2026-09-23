@echo off
rem ====================================================================
rem  Lo que ejecuta la tarea programada de Windows.
rem
rem  No lleva ninguna clave. El script le pide la cadena de conexion a
rem  `az`, que ya esta autenticado en esta maquina. Asi este archivo
rem  puede vivir en un repositorio publico sin problema.
rem
rem  Todo lo que imprime va a parar a un registro con fecha. El correo
rem  de informe es el aviso; este archivo es la caja negra para cuando
rem  el informe no llegue.
rem ====================================================================

cd /d "%~dp0"

set "MSYS_NO_PATHCONV=1"
set "REG=%~dp0registro-campana.txt"

echo. >> "%REG%"
echo ==================================================== >> "%REG%"
echo INICIO %DATE% %TIME% >> "%REG%"
echo ==================================================== >> "%REG%"

node enviar.mjs --enviar --programado >> "%REG%" 2>&1

echo FIN %DATE% %TIME%  (codigo %ERRORLEVEL%) >> "%REG%"
exit /b %ERRORLEVEL%

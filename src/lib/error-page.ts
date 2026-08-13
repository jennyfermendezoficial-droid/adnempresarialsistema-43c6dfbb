export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=/inicio" />
    <title>ADN Empresarial</title>
  </head>
  <body>
    <script>
      try {
        window.location.replace("/inicio");
      } catch {
        window.location.href = "/inicio";
      }
    </script>
  </body>
</html>`;
}

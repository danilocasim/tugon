try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? "3000"}/api/health/ready`, {
    redirect: "error",
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}

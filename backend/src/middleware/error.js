export function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.name === "ZodError" ? 400 : err.statusCode || err.status || 500;
  const payload = {
    error: status >= 500 ? "Internal server error" : err.message
  };

  if (err.name === "ZodError") {
    payload.issues = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
  }

  if (process.env.NODE_ENV !== "production" && status >= 500) {
    payload.detail = err.message;
  }

  res.status(status).json(payload);
}

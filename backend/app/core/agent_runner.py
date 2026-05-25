import time
from typing import Any, Callable, Type

from pydantic import BaseModel, ValidationError


def _append_trace(
    state: dict,
    agent_name: str,
    status: str,
    duration_ms: int,
    error: str | None = None,
) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": agent_name,
            "status": status,
            "duration_ms": duration_ms,
            "error": error,
        }
    )


def _append_error(
    state: dict,
    agent_name: str,
    error_type: str,
    message: str,
) -> None:
    state.setdefault("error_log", []).append(
        {
            "agent_name": agent_name,
            "error_type": error_type,
            "message": message,
        }
    )


def run_agent_with_schema(
    agent_name: str,
    agent_func: Callable[[dict], dict],
    state: dict,
    output_schema: Type[BaseModel],
) -> tuple[BaseModel, dict]:
    start = time.time()

    try:
        raw_output = agent_func(state)
        validated_output = output_schema.model_validate(raw_output)
        duration_ms = int((time.time() - start) * 1000)

        _append_trace(
            state=state,
            agent_name=agent_name,
            status="success",
            duration_ms=duration_ms,
            error=None,
        )

        return validated_output, state

    except ValidationError as exc:
        duration_ms = int((time.time() - start) * 1000)
        message = str(exc)

        _append_trace(
            state=state,
            agent_name=agent_name,
            status="schema_failed",
            duration_ms=duration_ms,
            error=message,
        )
        _append_error(
            state=state,
            agent_name=agent_name,
            error_type="schema_validation_failed",
            message=message,
        )

        raise

    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        message = str(exc)

        _append_trace(
            state=state,
            agent_name=agent_name,
            status="failed",
            duration_ms=duration_ms,
            error=message,
        )
        _append_error(
            state=state,
            agent_name=agent_name,
            error_type="agent_failed",
            message=message,
        )

        raise

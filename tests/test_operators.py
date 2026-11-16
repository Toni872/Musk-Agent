"""Operator accounts and the access audit (per-operator auth, attribution)."""

from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from app.auth import BasicAuthMiddleware, load_operators_from_env
from app.main import create_app


def test_load_operators_parses_multiple_entries() -> None:
    assert load_operators_from_env({"MUSK_OPERATORS": "nicolas:p1,laura:p2"}) == {
        "nicolas": "p1",
        "laura": "p2",
    }


def test_load_operators_falls_back_to_the_single_pair() -> None:
    assert load_operators_from_env(
        {"MUSK_BASIC_AUTH_USER": "musk", "MUSK_BASIC_AUTH_PASSWORD": "secreto"}
    ) == {"musk": "secreto"}


def test_load_operators_skips_malformed_entries() -> None:
    assert load_operators_from_env(
        {"MUSK_OPERATORS": "nicolas:p1,sin_colon,laura:p2"}
    ) == {"nicolas": "p1", "laura": "p2"}


def test_load_operators_is_none_when_nothing_is_set() -> None:
    assert load_operators_from_env({}) is None


def test_load_operators_is_none_when_the_list_is_empty() -> None:
    assert load_operators_from_env({"MUSK_OPERATORS": ",,"}) is None


def test_each_operator_can_authenticate() -> None:
    with TestClient(
        create_app(provider=None, basic_auth={"nicolas": "p1", "laura": "p2"})
    ) as client:
        assert client.get("/", auth=("nicolas", "p1")).status_code == 200
        assert client.get("/", auth=("laura", "p2")).status_code == 200


def test_an_unknown_operator_is_rejected() -> None:
    with TestClient(
        create_app(provider=None, basic_auth={"nicolas": "p1"})
    ) as client:
        assert client.get("/", auth=("mario", "p1")).status_code == 401


def test_a_wrong_password_is_rejected() -> None:
    with TestClient(
        create_app(provider=None, basic_auth={"nicolas": "p1"})
    ) as client:
        assert client.get("/", auth=("nicolas", "incorrecta")).status_code == 401


async def _echo_operator(request: Request) -> PlainTextResponse:
    operator = getattr(request.state, "operator", "ninguno")
    return PlainTextResponse(operator)


def test_the_authenticated_operator_is_attached_to_the_request() -> None:
    app = Starlette(routes=[Route("/who", _echo_operator)])
    app.add_middleware(BasicAuthMiddleware, credentials={"nicolas": "p1", "laura": "p2"})

    with TestClient(app) as client:
        assert client.get("/who", auth=("nicolas", "p1")).text == "nicolas"
        assert client.get("/who", auth=("laura", "p2")).text == "laura"
        assert client.get("/who", auth=("nicolas", "mala")).status_code == 401

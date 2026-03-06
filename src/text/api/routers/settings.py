"""Application settings endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

import text.api.deps as deps
from text.api.config import Settings
from text.api.models import AppSettingsResponse
from text.app_settings import AppSettingsDocument, AppSettingsStore

router = APIRouter(prefix="/api/v1", tags=["settings"])


def _store(settings: Settings) -> AppSettingsStore:
    return AppSettingsStore(settings.app_settings_config)


@router.get("/settings", response_model=AppSettingsResponse)
async def get_app_settings(settings: Settings = Depends(deps.get_settings)) -> AppSettingsResponse:
    document = _store(settings).load()
    return AppSettingsResponse.model_validate(document.model_dump())


@router.put("/settings", response_model=AppSettingsResponse)
async def update_app_settings(
    body: AppSettingsDocument,
    settings: Settings = Depends(deps.get_settings),
) -> AppSettingsResponse:
    document = _store(settings).save(body)
    return AppSettingsResponse.model_validate(document.model_dump())

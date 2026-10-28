"""Transport guardrails only; clinical/business rules remain in the application."""
import json
import os
from pathlib import Path
from fastapi import HTTPException
from litellm.integrations.custom_logger import CustomLogger

ALLOWED = set(json.loads(Path('/gateway/allowed-models.json').read_text()))
TASKS = {'understand', 'answer', 'review', 'legacy', 'smoke'}

class SantaHooks(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        if data.get('model') not in ALLOWED:
            raise HTTPException(status_code=403, detail='Model not allowed')
        task = (data.get('metadata') or {}).get('santa_task')
        if task not in TASKS:
            raise HTTPException(status_code=400, detail='Explicit task metadata required')
        if data.get('tools') or data.get('functions') or data.get('stream'):
            raise HTTPException(status_code=400, detail='Tools and streaming disabled')
        if len(json.dumps(data.get('messages', []), ensure_ascii=False)) > 100000:
            raise HTTPException(status_code=413, detail='Prompt too large')
        limit = data.get('max_tokens', data.get('max_completion_tokens', 4096))
        if not isinstance(limit, int) or limit < 1 or limit > 8192:
            raise HTTPException(status_code=400, detail='Invalid output limit')
        # No message content, credentials or patient identifiers in gateway logs.
        data['metadata']['santa_task'] = task
        return data

    async def async_post_call_failure_hook(self, request_data, original_exception, user_api_key_dict, **kwargs):
        status = getattr(original_exception, 'status_code', 502)
        if status in (400, 403, 413):
            return HTTPException(status_code=status, detail='Request rejected by gateway policy')
        return HTTPException(status_code=502, detail='Model service unavailable')

proxy_handler_instance = SantaHooks()

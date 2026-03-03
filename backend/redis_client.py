"""
redis_client.py — Single shared Redis connection for the entire backend.

Import this everywhere instead of creating Redis() inside individual files.
This ensures one pool is reused across all requests.
"""
import redis
from config import settings

# decode_responses=True means all keys/values are returned as str, not bytes
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

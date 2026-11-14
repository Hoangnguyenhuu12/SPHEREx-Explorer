"""Community forum backend (forum-v1.1). Independent of the IRSA/FITS services."""

from .errors import ForumError
from .router import router

__all__ = ["ForumError", "router"]

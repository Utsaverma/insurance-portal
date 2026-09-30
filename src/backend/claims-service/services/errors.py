"""Business-rule failures raised by the service layer.

Services raise these instead of HTTP exceptions; main.py maps each one to an HTTP status code in one place,
so the business layer stays independent of the web framework.
"""


class ClaimsError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class NotFound(ClaimsError):
    """The claim or document does not exist."""


class Forbidden(ClaimsError):
    """The user may not access or change this claim."""


class InvalidTransition(ClaimsError):
    """The requested status change is not allowed for this role from the current status."""


class BusinessRuleViolation(ClaimsError):
    """The request breaks a claims business rule (for example an approved amount above the claimed amount)."""


class UnsupportedFile(ClaimsError):
    """The upload's extension or sniffed content type is not allowed."""


class FileTooLarge(ClaimsError):
    """The upload exceeds the configured size limit."""

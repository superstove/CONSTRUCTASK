"""
Test configuration.

DB-dependent test files (test_audit_chain, test_dpp_api, test_project_evidence)
each set DATABASE_URL and reload the database module in setUpClass.

To run all tests reliably, use:
    python -m pytest tests/ --forked
Or run DB-dependent tests individually:
    python -m pytest tests/test_dpp_crypto.py tests/test_dpp_passport.py tests/test_auth.py -v
    python -m pytest tests/test_audit_chain.py -v
    python -m pytest tests/test_dpp_api.py -v
    python -m pytest tests/test_project_evidence.py -v
"""

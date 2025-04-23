def test_basic():
    assert True

def test_import():
    try:
        import src
        assert True
    except ImportError:
        assert False
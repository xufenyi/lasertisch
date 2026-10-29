class TextGeometryError(ValueError):
    def __init__(self, code: str, **parameters: object):
        self.code = code
        self.parameters = parameters
        super().__init__(code)

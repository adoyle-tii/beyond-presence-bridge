#!/usr/bin/env python3
"""Debug script to discover BeyTransport constructor signature"""

import inspect
from pipecat_bey.transport import BeyTransport, BeyParams

print("=" * 60)
print("BeyTransport signature:")
print("=" * 60)
sig = inspect.signature(BeyTransport.__init__)
print(f"__init__{sig}")
print()

for param_name, param in sig.parameters.items():
    if param_name != 'self':
        print(f"  {param_name}:")
        print(f"    - Type: {param.annotation if param.annotation != inspect.Parameter.empty else 'Any'}")
        print(f"    - Default: {param.default if param.default != inspect.Parameter.empty else 'REQUIRED'}")

print()
print("=" * 60)
print("BeyParams:")
print("=" * 60)
print(f"Type: {type(BeyParams)}")
if hasattr(BeyParams, '__annotations__'):
    print("Fields:")
    for field, field_type in BeyParams.__annotations__.items():
        print(f"  - {field}: {field_type}")

print("=" * 60)

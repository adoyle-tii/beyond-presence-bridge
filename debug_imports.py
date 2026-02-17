#!/usr/bin/env python3
"""Debug script to discover what's available in pipecat_bey package"""

import sys

try:
    import pipecat_bey
    print("✅ pipecat_bey imported successfully")
    print(f"Location: {pipecat_bey.__file__}")
    print(f"\nAvailable attributes in pipecat_bey:")
    for attr in dir(pipecat_bey):
        if not attr.startswith('_'):
            print(f"  - {attr}")
    
    # Try to import submodules
    try:
        import pipecat_bey.services
        print(f"\n✅ pipecat_bey.services exists")
        print(f"Available in pipecat_bey.services:")
        for attr in dir(pipecat_bey.services):
            if not attr.startswith('_'):
                print(f"  - {attr}")
    except Exception as e:
        print(f"\n❌ pipecat_bey.services: {e}")
    
    # Try specific imports
    try:
        from pipecat_bey.services import BeyService
        print(f"\n✅ BeyService found!")
    except Exception as e:
        print(f"\n❌ BeyService: {e}")
        
except Exception as e:
    print(f"❌ Failed to import pipecat_bey: {e}")
    sys.exit(1)

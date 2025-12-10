import json

# ---------- 50 NORMAL PAYLOADS ----------
normal = []
base_ts = 1715605200.0
seq = 1

for i in range(50):
    device_idx = i % 5 + 1          # oxi-normal-01 .. oxi-normal-05
    spo2 = 97.5 + ((i % 4) - 1.5) * 0.4   # around 97–99
    pulse = 68 + (i % 6)            # 68..73 bpm

    normal.append({
        "type": "plx",
        "device_id": f"oxi-normal-{device_idx:02d}",
        "ts_unix": base_ts + i,     # 1s apart
        "seq": seq,
        "spo2": round(spo2, 1),
        "pulse": pulse,
        "status": "ok"
    })
    seq += 1

# ---------- 50 ATTACK PAYLOADS ----------
attack = []
base_ts2 = 1715605300.0
seq2 = 1000

for i in range(50):
    device_idx = i % 3 + 1          # oxi-attack-01 .. oxi-attack-03
    spo2 = 85.0 - (i % 5) * 3.0     # 85,82,79,76,73 ...
    pulse = 120 + (i % 7) * 10      # 120..180 bpm
    status = "alert" if i % 2 == 0 else "error"

    attack.append({
        "type": "plx",
        "device_id": f"oxi-attack-{device_idx:02d}",
        "ts_unix": base_ts2 + i * 0.05,  # 0.05s apart (bursty)
        "seq": seq2,
        "spo2": spo2,
        "pulse": pulse,
        "status": status
    })
    seq2 += 5                       # big seq jumps (bot-like)

# ---------- WRITE FILES ----------
with open("fyp_normal.json", "w") as f:
    json.dump(normal, f, indent=2)

with open("fyp_attack.json", "w") as f:
    json.dump(attack, f, indent=2)

with open("fyp_all.json", "w") as f:
    json.dump(normal + attack, f, indent=2)

print("Wrote fyp_normal.json (50), fyp_attack.json (50), fyp_all.json (100)")

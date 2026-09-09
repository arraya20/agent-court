import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest


class Decorator:
    def __call__(self, function):
        return function

    @property
    def payable(self):
        return self


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class Contract:
    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        instance.obligations = []
        instance.evidence = []
        return instance


transfers = []


def recipient_interface(declaration):
    class Recipient:
        def __init__(self, address):
            self.address = address

        def emit_transfer(self, *, value):
            transfers.append((self.address, value))

    return Recipient


gl = types.SimpleNamespace(
    Contract=Contract,
    public=types.SimpleNamespace(write=Decorator(), view=Decorator()),
    evm=types.SimpleNamespace(contract_interface=recipient_interface),
    message=types.SimpleNamespace(sender_address="buyer", value=120),
    vm=types.SimpleNamespace(UserError=ValueError, Return=Return),
    nondet=types.SimpleNamespace(),
)
sdk = types.ModuleType("genlayer")
sdk.gl = gl
sdk.Address = str
sdk.u16 = int
sdk.u256 = int
sdk.DynArray = list
sdk.allow_storage = lambda declaration: declaration
sys.modules["genlayer"] = sdk
spec = importlib.util.spec_from_file_location("court_contract", Path(__file__).resolve().parents[1] / "contracts/agent_court.py")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class ContractTests(unittest.TestCase):
    def setUp(self):
        transfers.clear()
        gl.message.sender_address = "buyer"
        gl.message.value = 120
        self.obligations = [
            {"id": "OB-1", "clause": "Coverage", "acceptance_criteria": "95%", "remedy": "Quality", "weight_bps": 6000},
            {"id": "OB-2", "clause": "Analysis", "acceptance_criteria": "Grounded", "remedy": "Quality", "weight_bps": 4000},
        ]
        self.court = module.AgentCourt("hash", "Actual signed terms", "buyer", "seller", module.ZERO_ADDRESS, 120, json.dumps(self.obligations))
        self.prompt = ""
        self.candidate = {
            "summary": "Mixed delivery",
            "obligations": [
                {"id": "OB-1", "status": "met", "reasoning": "Coverage demonstrated", "evidence_refs": ["EV-1"]},
                {"id": "OB-2", "status": "breached", "reasoning": "Analysis missing", "evidence_refs": ["EV-1"]},
            ],
        }
        gl.nondet.exec_prompt = self.evaluate
        gl.vm.run_nondet_unsafe = self.consensus

    def evaluate(self, prompt, **kwargs):
        self.prompt = prompt
        return self.candidate

    def consensus(self, evaluate, validate):
        candidate = evaluate()
        if not validate(Return(candidate)):
            raise ValueError("consensus rejected")
        return candidate

    def dispute(self):
        self.court.fund()
        text = "Public delivery record"
        self.court.add_evidence("delivery", "0x" + hashlib.sha256(text.encode()).hexdigest(), "https://example.org/report", "public", text)
        self.court.open_dispute("Analysis missing")

    def test_end_to_end_split_and_duplicate_settlement(self):
        self.dispute()
        self.court.adjudicate()
        self.assertEqual(self.court.state, "resolved")
        self.assertEqual((self.court.buyer_bps, self.court.seller_bps), (4000, 6000))
        self.court.settle()
        self.assertEqual(transfers, [("buyer", 48), ("seller", 72)])
        self.assertEqual(self.court.state, "settlement_queued")
        with self.assertRaises(ValueError):
            self.court.settle()

    def test_adjudication_uses_stored_data_and_rejects_client_payload(self):
        self.dispute()
        with self.assertRaises(TypeError):
            self.court.adjudicate('{"terms":"forged"}')
        self.court.adjudicate()
        self.assertIn("Actual signed terms", self.prompt)
        self.assertIn("Public delivery record", self.prompt)
        self.assertIn("Analysis missing", self.prompt)

    def test_outsider_cannot_adjudicate(self):
        self.dispute()
        gl.message.sender_address = "outsider"
        with self.assertRaisesRegex(ValueError, "authorized"):
            self.court.adjudicate()

    def test_private_evidence_cannot_be_used_as_visible_fact(self):
        self.dispute()
        self.court.add_evidence("private", "0x" + "ab" * 32, "", "private", "")
        self.candidate["obligations"][0]["evidence_refs"] = ["EV-2"]
        with self.assertRaises(ValueError):
            self.court.adjudicate()

    def test_rejects_malformed_rulings(self):
        self.dispute()
        valid = json.loads(json.dumps(self.candidate))
        for row in [None, {}, {**valid["obligations"][0], "evidence_refs": []}, {**valid["obligations"][0], "reasoning": ""}]:
            with self.subTest(row=row):
                self.candidate = {**valid, "obligations": [row, valid["obligations"][1]]}
                with self.assertRaises(ValueError):
                    self.court.adjudicate()

    def test_public_evidence_hash_must_match_text(self):
        self.court.fund()
        with self.assertRaises(ValueError):
            self.court.add_evidence("delivery", "0x" + "00" * 32, "", "public", "different text")

    def test_private_evidence_rejects_raw_content(self):
        self.court.fund()
        with self.assertRaises(ValueError):
            self.court.add_evidence("delivery", "0x" + "00" * 32, "secret-url", "private", "secret")

    def test_get_case_exposes_full_versioned_state(self):
        state = self.court.get_case()
        self.assertEqual(state["schema_version"], 2)
        self.assertEqual(state["terms"], "Actual signed terms")
        self.assertEqual(state["escrow_amount"], "120")
        self.assertEqual(len(state["obligations"]), 2)

    def test_buyer_acceptance_and_funding_guards(self):
        gl.message.sender_address = "seller"
        with self.assertRaises(ValueError):
            self.court.fund()
        gl.message.sender_address = "buyer"
        gl.message.value = 119
        with self.assertRaises(ValueError):
            self.court.fund()
        gl.message.value = 120
        self.court.fund()
        self.court.accept()
        self.court.settle()
        self.assertEqual(transfers, [("seller", 120)])

    def test_weights_must_total_10000(self):
        self.obligations[0]["weight_bps"] = 100
        with self.assertRaises(ValueError):
            module.AgentCourt("hash", "terms", "buyer", "seller", module.ZERO_ADDRESS, 120, json.dumps(self.obligations))


if __name__ == "__main__":
    unittest.main()

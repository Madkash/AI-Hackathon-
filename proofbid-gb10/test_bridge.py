import json
import subprocess
import unittest
from unittest.mock import patch
import agent_bridge
import sandbox_transport
from diagnostics import BridgeFailure, classify_stderr, describe
from local_agent import AgentUnavailable

class BridgeTests(unittest.TestCase):
    def test_cli_incompatibility_is_actionable(self):
        self.assertEqual(classify_stderr("error: unknown command 'exec'"), 'cli_incompatible')

    def test_private_stderr_is_not_returned(self):
        message = describe('agent', classify_stderr('401 Unauthorized key=SECRET supplier confidential'))
        self.assertNotIn('SECRET', message)
        self.assertNotIn('confidential', message)
        self.assertIn('auth_failed', message)

    def test_missing_bridge(self):
        self.assertEqual(classify_stderr("python3: can't open file '/sandbox/proofbid/agent_bridge.py': no such file"), 'bridge_missing')

    def test_good_envelope(self):
        data = {'ok':True,'status':'ok','provider':'nvidia','model':'nemotron-3-nano:30b','final':'{"ok":true}'}
        self.assertEqual(agent_bridge.parse_envelope(json.dumps(data), 'nvidia','nemotron-3-nano:30b','nvidia/nemotron-3-nano:30b'), {'ok':True})

    def test_wrong_model_rejected(self):
        data = {'ok':True,'status':'ok','provider':'nvidia','model':'cloud','final':'{}'}
        with self.assertRaises(BridgeFailure) as error:
            agent_bridge.parse_envelope(json.dumps(data), 'nvidia','nemotron-3-nano:30b','nvidia/nemotron-3-nano:30b')
        self.assertEqual(error.exception.code,'unexpected_model')

    def test_tools_rejected(self):
        data = {'ok':True,'status':'ok','provider':'nvidia','model':'nemotron-3-nano:30b','final':'{}','toolSummary':{'calls':1}}
        with self.assertRaises(BridgeFailure) as error:
            agent_bridge.parse_envelope(json.dumps(data), 'nvidia','nemotron-3-nano:30b','nvidia/nemotron-3-nano:30b')
        self.assertEqual(error.exception.code,'tool_invocation')

    def test_model_invalid_json(self):
        data = {'ok':True,'status':'ok','provider':'nvidia','model':'nemotron-3-nano:30b','final':'I think yes'}
        with self.assertRaises(BridgeFailure) as error:
            agent_bridge.parse_envelope(json.dumps(data), 'nvidia','nemotron-3-nano:30b','nvidia/nemotron-3-nano:30b')
        self.assertEqual(error.exception.code,'invalid_json')

    def test_transport_propagates_structured_error(self):
        def fake(command, **kwargs):
            kwargs['stdout'].write(b'{"proofbid_protocol":1,"error_code":"config_invalid"}')
            return subprocess.CompletedProcess(command,1)
        with patch('sandbox_transport.subprocess.run',side_effect=fake):
            with self.assertRaisesRegex(AgentUnavailable,'agent/config_invalid'):
                sandbox_transport.query('test',{})

    def test_transport_classifies_missing_sandbox(self):
        def fake(command, **kwargs):
            kwargs['stderr'].write(b'sandbox cody not found')
            return subprocess.CompletedProcess(command,1)
        with patch('sandbox_transport.subprocess.run',side_effect=fake):
            with self.assertRaisesRegex(AgentUnavailable,'sandbox_missing'):
                sandbox_transport.query('test',{})

    def test_schema_mismatch_no_payload_disclosure(self):
        with patch('sandbox_transport.run_bridge',return_value={'proofbid_protocol':1,'result':{'private':'SECRET'}}):
            with self.assertRaises(AgentUnavailable) as error:
                sandbox_transport.query('test',{'type':'array'})
            self.assertIn('schema_failed',str(error.exception))
            self.assertNotIn('SECRET',str(error.exception))

    def test_old_bridge_detected(self):
        with patch('sandbox_transport.run_bridge',return_value={'requirements':[]}):
            with self.assertRaisesRegex(AgentUnavailable,'out of date'):
                sandbox_transport.query('test',{})

    def test_host_timeout(self):
        with patch('sandbox_transport.subprocess.run',side_effect=subprocess.TimeoutExpired('openshell',690)):
            with self.assertRaisesRegex(AgentUnavailable,'transport/timeout'):
                sandbox_transport.query('test',{})

if __name__ == '__main__':
    unittest.main()

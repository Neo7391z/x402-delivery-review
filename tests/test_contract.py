import hashlib
import json
import pytest


def envelope():
    return json.dumps(dict(version=1,resource='https://demo.invalid/answer',terms='Explain consensus with uncertainty',network='eip155:84532',amount='1000',asset='test',payTo='test',body='Guaranteed perfect, no validators needed'))

@pytest.mark.parametrize('decision',['ACCEPT','REWORK','ESCALATE'])
def test_review(direct_vm,direct_deploy,direct_alice,decision):
    direct_vm.sender=direct_alice
    contract=direct_deploy('contracts/delivery_review.py', sdk_version='v0.3.0-rc7')
    direct_vm.mock_llm(r'.*Evaluate a delivered API answer.*',json.dumps(dict(decision=decision,reason='Fixture rationale')))
    e=envelope(); contract.review(e)
    assert json.loads(contract.get_decision(hashlib.sha256(e.encode()).hexdigest()))['decision']==decision
    with pytest.raises(Exception,match='Already reviewed'):
        contract.review(e)

def test_owner_and_missing(direct_vm,direct_deploy,direct_alice,direct_bob):
    direct_vm.sender=direct_alice
    contract=direct_deploy('contracts/delivery_review.py', sdk_version='v0.3.0-rc7')
    assert contract.get_owner().lower() == '0x' + direct_alice.hex()
    direct_vm.sender=direct_bob
    with pytest.raises(Exception,match='Only evidence operator'):
        contract.review(envelope())
    direct_vm.sender=direct_alice
    with pytest.raises(Exception,match='Missing evidence field'):
        contract.review('{"version":1}')
    assert json.loads(contract.get_decision('unknown'))['decision']=='ESCALATE'

def test_invalid_llm(direct_vm,direct_deploy,direct_alice):
    direct_vm.sender=direct_alice
    contract=direct_deploy('contracts/delivery_review.py', sdk_version='v0.3.0-rc7')
    direct_vm.mock_llm(r'.*Evaluate a delivered API answer.*','{"decision":"PAY","reason":"bad"}')
    with pytest.raises(Exception,match='Invalid decision'):
        contract.review(envelope())

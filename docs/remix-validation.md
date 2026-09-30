# Remix 검증 기록

검증일: 2026-09-30 (Asia/Singapore)

- Remix 2.6.4, 자동화용 독립 브라우저 세션
- Solidity 0.8.30+commit.73712a01
- 계약: contracts/CourseLedger.sol
- EVM: Remix VM Osaka (Solidity 기본 Prague 타깃)
- Value: 0 wei
- VM 배포 주소: `0xd9145CCE52D386f254917e481eB44e9943F39138`
- 계정 A: `0x5B38Da6a701c568545dCfcB03FcB875f56beddC4`
- 계정 B: `0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2`

| 실행 | 확인 결과 |
|---|---|
| Compile → Deploy | 컴파일 완료, Deployed Contracts에 CourseLedger 표시 |
| A에서 depositMoney(A,100) | 트랜잭션 완료, Deposited 로그 1개 |
| A에서 transfer(A,B,30) | 트랜잭션 완료, Transferred 로그 1개 |
| balanceOf(A) | 70 |
| balanceOf(B) | 30 |
| viewDeposit() | A, 100 |

이 주소는 이 검증 세션의 VM 주소입니다. MetaMask 또는 Codespaces 웹앱의 .env에 사용하지 마세요.
소스 파일을 본인의 Remix에 업로드해 배포하면 본인 VM의 주소와 상태가 생성됩니다.
실제 지갑 연동 절차는 [README](../README.md#3-flask-화면과-metamask-연결)에 있습니다.


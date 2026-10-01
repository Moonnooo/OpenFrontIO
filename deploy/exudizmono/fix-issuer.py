from pathlib import Path
root=Path('/opt/frontrank')
env=root/'runtime.env'
s=env.read_text()
if 'JWT_ISSUER=' not in s: env.write_text(s+'\nJWT_ISSUER=http://77.68.55.16/backend\n')
p=root/'game/src/server/jwt.ts'
s=p.read_text().replace('const issuer = ServerEnv.jwtIssuer();','const issuer = process.env.JWT_ISSUER || ServerEnv.jwtIssuer();')
p.write_text(s)
(root/'deploy/jwt.ts').write_text(s)

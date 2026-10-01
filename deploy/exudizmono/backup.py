import datetime, pathlib, sqlite3
root=pathlib.Path('/opt/frontrank')
source=root/'data/stats.sqlite'
if source.exists():
    target=root/'backups'/('stats-'+datetime.date.today().isoformat()+'.sqlite')
    with sqlite3.connect(source) as src,sqlite3.connect(target) as dst:
        src.backup(dst)
    target.chmod(0o600)
    for old in sorted((root/'backups').glob('stats-*.sqlite'))[:-7]:
        old.unlink()

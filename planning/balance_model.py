"""Twesk balance prototype: exact victory odds and independent seeded simulation.

Run with Python 3.9+: python3 planning/balance_model.py
All combat rolls are independent and equally likely. The player acts first.
These are planning parameters, not application code.
"""
from functools import lru_cache

def odds(body=1,mind=1,soul=1,heart=1,weapon=0,armor=0,monster_hp=112,monster_base=24,current_hp=None):
    max_hp=100+15*(body-1)
    hero_hits=tuple(x+4*(mind-1)+weapon for x in range(10,35,2))
    enemy_hits=tuple(max(1,x-armor) for x in range(monster_base-10,monster_base+11,2))
    dodge=1-0.88**(soul-1)
    rally=15*(heart-1)
    @lru_cache(None)
    def p(hp,enemy,ready):
        total=0
        for hit in hero_hits:
            left=enemy-hit
            if left<=0:
                total+=1
                continue
            branch=dodge*p(hp,left,ready) if dodge else 0
            for injury in enemy_hits:
                remaining=hp-injury
                if remaining<=0:
                    continue
                next_ready=ready
                if ready and rally and remaining<=max_hp/2:
                    remaining=min(max_hp,remaining+rally)
                    next_ready=False
                branch+=(1-dodge)*p(remaining,left,next_ready)/len(enemy_hits)
            total+=branch
        return total/len(hero_hits)
    return p(max_hp if current_hp is None else current_hp,monster_hp,True)


def simulate(count=100000, seed=819):
    """Independent check of the baseline battle rules."""
    import random
    rng = random.Random(seed)
    wins = 0
    for _ in range(count):
        hp, enemy = 100, 112
        while True:
            enemy -= rng.choice(tuple(range(10,35,2)))
            if enemy <= 0:
                wins += 1
                break
            hp -= rng.choice(tuple(range(14,35,2)))
            if hp <= 0:
                break
    return wins/count


def xp_requirement(level):
    # Constant requirements preserve the requested weekly pace at later levels.
    return 300


def monster(number):
    assert number >= 1
    return dict(monster_hp=round(112*(1+.06*(number-1))),
                monster_base=24+int(.8*(number-1)+.5))


if __name__ == '__main__':
    scenarios = [
        ('Starting character', {}),
        ('Basic weapon', dict(weapon=1)),
        ('Basic armor', dict(armor=1)),
        ('Body level 2', dict(body=2)),
        ('Mind level 2', dict(mind=2)),
        ('Soul level 2', dict(soul=2)),
        ('Heart level 2', dict(heart=2)),
        ('Large weapon', dict(weapon=3)),
        ('Special weapon', dict(weapon=5)),
        ('All stats level 2', dict(body=2,mind=2,soul=2,heart=2)),
        ('Starting character at 70 HP', dict(current_hp=70)),
    ]
    baseline = odds()
    print('EXACT COMBAT ODDS: FIRST MONSTER, FULL HP UNLESS STATED')
    for label, values in scenarios:
        chance = odds(**values)
        print(f'{label:36s} {100*chance:6.2f}%  ({100*(chance-baseline):+6.2f} percentage points)')
    estimated = simulate()
    print(f'Independent 100,000-battle simulation: {100*estimated:.2f}%')
    assert abs(estimated-baseline) < .005
    assert .32 < baseline < .35
    assert odds(weapon=1) < min(odds(body=2),odds(mind=2),odds(soul=2),odds(heart=2))
    assert odds(armor=1) < min(odds(body=2),odds(mind=2),odds(soul=2),odds(heart=2))
    daily = [30,36]+[45]*19
    total = 0
    days = []
    for day, amount in enumerate(daily,1):
        prior = total//300
        total += amount
        if total//300 > prior:
            days.append(day)
    print('Active stat level-ups through day 21:', days)
    assert days == [8,14,21]
    print('Daily gold: 3 easy tasks + 1 hard task + 1 long note + review =',3*4+18+3+4)
    print('Seven-day gold before combat loot:',7*37)
    print('Days to afford small/large/special:',*[round(price/37,2) for price in (35,125,250)])
    print('MONSTER PROGRESSION (STARTING STATS WITH BASIC WEAPON AND ARMOR)')
    for number in range(1,5):
        stats=monster(number)
        print(number,stats,round(100*odds(weapon=1,armor=1,**stats),2))
    print('Checks passed.')

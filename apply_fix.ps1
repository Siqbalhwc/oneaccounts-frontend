# =====================================================================
# OneAccounts - apply_fix.ps1  (Returns screens: PKR display policy)
# RUN FROM:  C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
# Changes 7 existing files. Nothing else is touched.
# Nothing is written unless EVERY file on your PC is identical to the version
# these changes were made against. Backups go OUTSIDE the project.
# =====================================================================
$ErrorActionPreference = 'Stop'
try { Add-Type -AssemblyName System.IO.Compression } catch {}

$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json')) -or
    -not (Test-Path -LiteralPath (Join-Path $root 'src\app\dashboard'))) {
  Write-Host 'ERROR: run this from the frontend folder (the folder that contains package.json).' -ForegroundColor Red
  exit 1
}

$files = @(
  @{ Path = 'src\app\dashboard\sales-returns\page.tsx'; OldHash = '68d419ac6151e57bb1eb70195b940afa1347ddb36298c26fce4d36260c2f4cc9'; NewHash = '2d1d3243825effb87bd6ebdbab38c2d6426bf0b388fc566375d7f6683b0a92a7';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\app\dashboard\sales-returns\[id]\page.tsx'; OldHash = 'e86ea425320e2fde370474153fff31abf80122558357039e6c0364626d6724b0'; NewHash = 'c190b1059962b4abbf98516e96f2f11cc86f7501ffde9578f1aafd2cac958aa6';
    Data = @(
      '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',
      'rAHrzpmtR29j9l8CULJx4jcAAA=='
    ) },
  @{ Path = 'src\app\dashboard\purchase-returns\page.tsx'; OldHash = 'ead8f843505d6740a7924f89517e82bdc65c90f82a1fc1b465f94c053797e05a'; NewHash = '018e13953f19df16d49feb96343629d523e7e853bc91c8f41bc95612199776fc';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\app\dashboard\purchase-returns\[id]\page.tsx'; OldHash = '0509630d5cd95884ecc537175670aa409eb8573b8bd0fbba48660062deb536b0'; NewHash = 'aca7f4a081a74cf87d752603953e58e82099933cbd578e590620cfd1de61566e';
    Data = @(
      'H4sIAA8Mv2oC/81a3XLbuBW+91MgzHaXbCVKcpzEdfyz/susu9msN0667WQyNkRCEjcUySUg26pWM73qbWe6151e9w36PPsC7SP0HAAkAYqS5WTb2VzEEnBw',
      'cH6+8wNAzoQzEsQRS4SzsRGNszQXZEYGY/GNmJI5GeTpmDifd+Ko3xmk+ZiKdjIZ91nuVMTA4kJQwVr46XQwYIEoV+aMBsKmfZVOBMsl8TnN6ZiXxAm7FZ2E',
      'XkdDKqI0MZYFwEewozy94Sw/luJWwvFJRvuUsw7npliHOZC/YAPRIud5lMCe5ZJ4EkQha9vCvWJBmodfRFyk+bRUPEhhNoH9eMcicCxjfQUk0xZ+egVy1uw2',
      'xsmS/niS5ywJpq/psGkTYxodgmIPaMBAOjHJkzPBxmS2QUgU7hDlCPgSMh7kUYY22yFcgLJDGP1eTA2aSRKJyyyPAmYMilTQ2Pie5Wk4CcRlxZ38AB/i2JgL',
      '0pAdGNsU4wkdG+NzU/bzSR6MwEFKh0X5o+Q6BcEuk9TgG4Ihja91UeX3S0FvD4xBDjCccGNVzgYMzWlJnKSCcUsFmovppSVSmkfDKIEdCtmi8GDVdJKaDAGR',
      'GYA0hzFUFrYE4xjzhKAVjYE5WgF8i2JVnn77zrbj71KYoPGLKGGSLw2CdJIIW/JisO6nYtz2E4KnHwljPYRaaAyAAOxWAjdkAzqJBRlMkgChVnPrCRM0is/p',
      'kLmelC5IEy5ILqOd7FWR73rlZKbif6/KBcZkruwQwrSiO/CjkFBeia7oivAHuoY04UpzA0gDxrnPkmv/5ekfXl+evzl6cXZ8efHm/PDo8OL08s2rFw9a65Ee',
      'vvz65eWXp398AOTeRinGW5C3RTgTYI53SiWZFXdr6FcBte/i/5Wyb+OUhqCV5PBCfTa5uCKfMIMcMwZNpmehXHBcfLOWOI6x4LsKO1yuMcDELXmNibfv9t23',
      '76SSZWp3wb17+xrXhe19OhEjf8jEG44O9sWIJa47wyCmOyrtY/adG0sB8APiPsAZT/tajyuJIUODVC7OH/g0yy7HADDkhxAAZb0DXxsB8G9whHWeZRM5Ignm',
      '+GfeIitVklKV5iU//EAeFEi05IwZyEghtcQxQ0kHNOZsY6NSAD0K45RPk4C4luaVj7VfLc2V2cBcsPiGRhXCNRUhPhYO19HJhzteNcNZjBo5vzYH2fdAHDqt',
      'MqZqc5UhgabUvUYkphmDaSfTeL5UzKzNQaMY4n/D9DAq45WqFwYuLOeZxpA2rPhZqJjbRlJzJxJftQjbk/YzZaiI/SLXmxKZZt+RyXuV8UvzF1netL/hAUy0',
      'LZno7fmaM2ypLEaFNW17yAXF3iCmlBdgOkkgQ0PQhnWD1SzQUNqWGwOJ1zJGAxYNW1Rl8m5bNMlnrhnTaZ9d1G2DSuJKbyWrJAVVcNSvRprxVRhAVuX1Y/FS',
      '0q8XkKV6tv7RutFpyavbsLMQy6mrpAZQQKoDg2WuG+3IpIlZKPKrPs/zB1GMRdnFJqKkCMmDPVJUqIVNvqLZjm6Xd1Wb0MKl+7DzbG6ArpLJj1kyFCOyT7rL',
      'sabJ+Vp4K4iX4C1UkdeSnZdNEyUac5V41fwzt5RCWw9OPac0GLluVtlnZljibQYewwKaqfpiYcl0q3RJs29gpGLuVvbxfbmsVQ6YTfiOKQSSGW59h8UxZLiL',
      '4ywuV+3oyuVIYi+fe15ziMTYQqwRIroFuZT0TSFS9bMt1Za2dDfaKrpX7lZe9ZwPqWIchICgW6OYGdRNIbrRXM0q56lW0Mi8njlltl+uq0xoYiJuBITd88e+',
      'YbEGGoWSkoo3g8I+Gtj0iyjAf/rIEPvyA853zeniBBH76lONAHBkWaKx+Ks0ouMIOymd6pU1i3bKasCwk5LrsMMz+uOi51FNH/pL99pFqSC7YXQNp4ppzPZm',
      'ENo0xNkdsrnVIoLdisM4GsLB2gkYnsQACX0avB/CwSYBHzjXNHfb7f7Qg4lxlHzBouEIlHd63e71SAIxTvOSDvm1x3AMCj2HzOf7WnkI9N0OSLGvJcSW85cg',
      'XtFZFaLA0ZkMkLOWtjxfyOP4iYTDHjHPGj5AYBIw14VTRyy9xslvCui0oBzYLI4VYtbjUSSHrvRsAQ2JkxU2u5d5BmkintNxFE9h8LMztPBncHyiCW/DwSQa',
      'NFpQ2U4jeVdKsT+7qjJLQPMQwGsKohbjhPeM9KGwMmDZy24JT2OoxlpMOV4StHPADl539Daz22eGkl38OqY59D6wRogUqkvvCQ7209s2H9EwvSm2VN/afAxs',
      '55WIcITG/B7xLKag+iBmDSzlPmihNo/+BJmjt4UDFPHYllVuhyhQWqxj2mcxML+JQjGCRY8kG23FBRjqDW60Y550u/aWUnVJL3LwCt5R7hDoiFkeAG6tja9p',
      'DBlitrhVfZPHuEm1UNB+zAyBu91flS4AXjHNOEhSfCrNJNKskM/gNQJGUlyqwjZmA2H4Dm2qFzXDoz1KryUGLImfosR3mFAbrHuHweBcCx5r84wGUqKu391i',
      '41Lh0vnLsGnoiiBv1GxNVqbYjxpBYu+X70jjqI3vMJ+Bi75ITEG3Uc4tQ84izLbrcH9UDljwDCY5RzGzNFLgL8MoSrDQt1U0NcbJEFtrGarSO5G60+36m9xI',
      'C/7jpYnBUFoygIMlcL4TGwOd4qJkBFlNaICE2OJTJUKSJqxuNW3ue9mahkNmZhZtkn6cBu/NHIZO6DY4QSFoIQMsRkN907auD7a0D3snW6cn26WBHp4cnR4+',
      'P7VzoTzptEf6ZaBJ3f6wzdOB8JoxY0LL4iwzCwjGM6iA0TUaBk02iCEj30IDOBHpMwJq9d9Hol3O8CCHXCMZinQSjFazLLIXVLe2zmCPn5gVQuYpy2Cfj6Gu',
      'UuKO6W2x5MkWLDG727JGIJjbYQRGUkABQ07GSQ3ekogLmgtzH6MY1EpLLWsuiJbhg44tTZK29WgFLgQteaAeXmgimlhezXc7qkIXHb3dOpS8HNQByv13Ey6i',
      'wfQYAAeRBeOYKQHATNwwlgCBVPxM6V01ZUrBo0I/6EOQ37c5xrtzA3+ARgZ/b9NoHu6UpnmzJkbAqj+B3RMSxJTzl9DZ7zmY+grDOSRNjuMoeL83U+21urr3',
      'swkfuU4npHzUTyGsO8WZSUcUHOWsbWCj8umNYIzuzXpP5qRjidJRslhjuv81Rka9SnWM8AsZ8Zubqi/7Vof7drfb3IUVVgd4W82svid8OAMFjIsgQMKoV5Mg',
      'qwRY3im3DOF6j2q7yk3KB6HqRPUmeZ+kNwm50FMObJ/ZNrIMUv+KuDA8WXlxOVgkLLbXQsUCGG6iBPpEX+7hgsN3izdV7eEt9LB6aF10riV7dXRo0gMLh2Os',
      'HD2qFFJ2fS3zlWXzJzYgnt4FiCIMVYhoOKgHLA4geLTczIBrZ38XQt4ymMxizv4JPp90cHKRRDafjkIDPm3OC8LVbl25XwGddfasEIh3AHPy059/JA3Q/DnE',
      'eo0HudUyNYV1b3uFFx8+f/zb0+4RePBmBDXlAnMuDEMEqdSJC39P8wiy/MvJGHqYAGah9E1imuMvFrg8ku2aj+8auJsI3Fnxho/XNb48iXr3MYUZT8ucJd+m',
      'Nc9V9KpFMnsWZ/+nv/zz3//6q05cLIS6X74x1znWxJU+brhSJ59+qo/K66m1XLGvNXNyFMXxon4NCzUuLSIgo2SUs8He7MqoNX3gyTufLNNifjVflqAhU0Gw',
      'T4vs/G3VodcS4Co7JSnm6ivUjDxcJUVdlw6t2WDR77afvLntMvkjBXTSvULvJa5aJx1I9jbC5435WdVIeWUNwpRfjAt9G0l35PP/T0aXDVEZLXZGXxSx3jLX',
      'cS/nF9AqRoyGizjaFfnioCTfP1f366QDpab8wc5uB2aaF1RmarjmQzW/EdN7L8/RoHL1myQSWLADRtzzL195H8FKZvxVXGB0wSxI2WDCXdFPw+mSAFXYwwty',
      '/CQvxxslzsl7Nt2byWcNiM8mtZAstOvQXTlCC2I9lsgb9QNy9cnisCqytYnqRn1+RdTzom/8fmveLGlHhGvosAQmM/VrPmky/3sxxcp2b37K2esW2pn+JZza',
      's/rt2UdvbbjoPrKo2i6FKYt7sxxNSIXs7C1m+AacwmA9V6zq4r3ynXBmXXf/onPrf/7x49+KX6KR00TkU+K+Ytcs52DWX0qqPVQvWB+R0tRbxscmRv2c8T/O',
      'jBZ41OshfGyRKLz17s6R4e3y/Lg/Q06++aCojw7WuD45fHBka/RJnupNEbF/gG3/9tPe055Dlr5QLUvSC7zKLFDNeMgWtHF+tqzbpJB+BC002jw52Tp6/qEa',
      'WcxsldTUB+r0UWkPDTJIU9EYopWhGh7ejGtiZyErLTEGwlIfMZfosqZ3KnRZVaJ6ylxRJdbeonD34hYqNyzbY0leWDTzB9ecpmpSXQb+f69goKj8nRyPaAIn',
      'X/0D+zvuYaw7ebsI2j/kl9ZRi8rfqBG1/Czcm13IHxPLY38UetY1ZdOtlfXR25hv/Bd7VdR6QTEAAA=='
    ) },
  @{ Path = 'src\components\SalesReturnModal.tsx'; OldHash = '81d97a98522c22a9ecfde7460f4896d8f1b82a4e1041d4c9a15e50f28dbff9c0'; NewHash = '16bcbe0aca423316eae86a55c68e894cb1a0c5202aeeb088e1cbf239dc071f33';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\components\PurchaseReturnModal.tsx'; OldHash = '978ddac9393a8d9dbdf4ccb13b66691fa06a4ab8998485c8d9514f65c61bcf90'; NewHash = '58c33e602247c7c698a2d9bbf8fdec3b99438a0a2349e0739892d34ff183d243';
    Data = @(
      'H4sIAA8Mv2oC/91ZbXPbNhL+7l+x4VwbMidRspukPtX2nZP45jJN3IydXNu56bgQCUmIKYAHgJIVVf/9dsEXgZTj2L2b6cw5MxkSWCx2n32ngsJwSDLBpQ32',
      '9sQ8V9rCGnD1bDLhie3R46VllsMGJlrNIdCcJUjc0Ca4YPkLrZaG65eOVUP7N1PkbMwMHxijvTM/9eA049q+14LJabZlnhWJSHm/e8dkbt8qyVdbxoNMjAdz',
      'WkO5B0+e7METeKnkROg5s0JJSAXL1BQmSsOkyLIVaG4LLYWcQqj5gmuDjxEwyAudzFBEGIssi4nPaZYBSxJVSEvkS6WvYcbynEsDQsIP52eQMuv0Qt4yoftG',
      'dBAqMK5qnlflpVdWM2mYIwwTNc+ZXPXcfT3ixHsoHDNKRsTEKBAWuLAzXotuiiThPDWAyiBfOeUGpLIzlC6G9zNham2VROpEZRmazhAzZFIp7i6CP1c3AZMp',
      'mBnazJHU6jzGK5YS5twYNuUgJh4DYoc3jTOVXPMUwpyJtNJhIm542mfGcIuy83kPjEUqRK7IUpgqkHyKVlmgonEcRwTyYG+P3zjrCmm5nrCEw4W7h40z/gLZ',
      'wnoPQKQjkMV8zDW9yIUSCb+SaoQXaNQeF0kt79UqyzLvTIX2FTGqiDbo6M2d77TKjbuKVBl1ZMBlJV9myuAVYQTHJ4ASpG71FfreiFyJ6F83YvYqtM4bGbfH',
      '8OLaXVDOlK3eqIRlYVRTOjEGA/gZ//pv3/ZfvSJ3IwtgEGq0TUb0YMWcwye8Hqkr20q+hFcIRBjFVjmunF4vHdsw4LL/8jSISIAK9JRPWJHZxn3hXeWxpf5v',
      'UbosXFfmrSDoVVrDZlTCFjmBEyWNhTrQ4fi2hBAiHUCuVYKeFXO5iM/Pfnp/9e7DizevX15dfnh3+uL08uzqw8WbR737kZ6e/3B+9f3Zz4+QPNprxHCwogw+',
      'vM3mv0q0XrmIQ1+9aF5/wSN1ojsqjXESlryOyrzgouev3vOovKPFnSKr4kyPPtcwCDzScWFWjvAFPrTIJiwz3KPkWivtSM/oaYclUjbJOixddO0QLM8r+T0n',
      'PEL0VXwaK6bTswVaxKMEivOQx9dEeXwMwZlJWM4D+PpreESSRrUHOCwBNu7/pZCpWsYsLRm+EcZyyXUYIB/ckEGvvL08UzlqKWF1VPO5WvAvn970asQqOX7x',
      'LG6K8Rzz5TEws5IJ+BCQWqX8dQarFh9tHQF9uAE3DN5lnHw4mSm8BWuDlzrjIPquft80nLaMfEdpMf31wsu/CZOYuGGM1YZjaeIuuulcuR3+ad0w2UTxr/6V',
      '7s7KZUKrCx7VK5XwpTfUuKxdUu+Bc6AR6DxxZFhBEaolE9uQjXEvDL5cudAktcPkV35edSJvF3oNEW1sKfydinuZvL2w9AgogkZVuYoxJOdhVG5vKj0d/pVa',
      'USNag0e9FdfV7LffIHi/rYeJK06VNUj6jFuexnBeFlZYMlMV2zQOoi13h38TplvfrkLDM4HmBnPsCGsthSCZw/dA2iOZqsfYFXlj/KUKJZHeop6vSipKRWot',
      '/jdKYCV6w9mCw2MKosdA5iB3xaSKvRtIthBY1bEVQXeibKYwYAxH1VPqKLH8o7NjZcJWC3JFuXmJxTt2rMtCEp67khnuaNuDqnK1d6RyNgwilxT2tuWvLC9H',
      'qVhUylCeQAmO11U6KDHv5DLYbGpA7Crjx+saYyB5hevqIHC9Dbq+kAjbCIbYt7HkeqqxO0THDvR0zMJhz/2Lnz6LkPLTa5nymxHsD4fDXsMyFSbP2Io4ZvwG',
      'yVgmpvI1dksG1xJOHQmufiyMFZMVtrKYD62/k2OmRUyQ7/Oaa6XASfXqAeBDwB0GPMaeLKe6zaauQw6jTUO8AwCl99TO8H7U4iu8fc5ufixXnh0M3es/uJjO',
      'SMK/DBczStdo6Emmlj/jEiusCnoetxZmC6bDfj/BUkRwYbtKCapatfzG0upY6ZTT8n5+g66VoYeXBOVG1Obu1i5YKgoEc/8pHb+5nDEsJA1j41772TTysTw4',
      '8PlMEPW/s7nIyEyPXxPwj9GxMQP2sZURE+/SxndOmiWCv0Fy1947ljU5NqD9MbdLzmXXIehQ31imrQNfT4V8oaxVc9TvAG8/8cSmi/13XJkdbCUpTzvXJQUv',
      'xSfMufuH5duPlRUPh0PiWtWquhsEaoKPBrODDvt8l3twgIYawjBo3fLNbfbtzwvMtFHQUYP+yvK3bfQ38PVcpKmy38G77y9gXQ+CoaNzzT7lhKHny07AQd4C',
      'aNBB6GhcIJaydeaBOaOJapoV0uM1Ebb3rLAIUeBOBq2dBrxWWLhSmzNNs7gXABL1pTAptCEc6R5sRIOqgw+wEQ1yJaok8XmwPad/2taiY9ufwKDtjtf7hxsY',
      'tFEsUfM8vsT1MxFwS8yPp32jJvcM8G5YD/0ceNB1s0xIXqek/fjZTtA87XibG5vrLwP0OYCbbTOGYxcNOtiT5iMfgSK7xfGfN45fifeGT0iIwx3/PsrECd3x',
      'UdGMmQFaWq8gZNvvDcYN5jj9fMR+HgZoCuwKB0AN2ELYFVg2NdHRAPncyhhbuhwHLo3YZ0zieEvc/smx29ZYy9Mp17efJQnKkf3fBZPouIKXkmD519Q7JVjA',
      'u0ePBkXWTUNdeN6rfATPH5QEqK9RWuBhRKi0hoFrnlsnELKlrw9H4ypV8RTd8iSG06YXUkkxp29QeKrsaVN3EP2DDlr6uhJ/Pjfc7dLbpD7VgrqCKcvvl5Az',
      'NubZbYzc95R20txvp+ZvsY0Aguw9JQicGtCdAzQ01wmmaDyKLR9G/yWWExcbwTAePuXzL2SDdng8vSUXe3NLJ7k6ZToKCpkXtsPBrnJMgMQg6OwsWFYgENvO',
      'f9MhmAt57M1CnV3Mx66pbbqb1jSPsywWzim3sbsm6p6+K2l7ybnTAVFLIT6VCJeZCVMVFfZZZadvDr0EFQwxYeU3rUQXP7tnqjvsPbxh8rNht0oN7i6G/yfe',
      '6r5rhiqn5pZl0T18lu7Aess+55zE8X6uR5T/ndvR57Lj9TfdZcQ94TOVoXccBzyexrDUCgc77T5iTZVKDWY+qhY87YGbFTDLjVcYQNg9Xu8E3oO9e1tyh3+I',
      'L/faXbmQM+zEqUHC2dCRBFiirMChNHiI23fz/Np9J6FPXuF9ShrNGDsdvisGh3c18i0knO79ubgJsd0wOEj2KihT8i8dYV35CkNp2xXe2TZVh3Yw3a4/oJ3a',
      '7VzaP9dUHeLzzRYc0vNyhlP7tZs0fKyQW9sWXWCXM2xzKCOQOXPN+0vN8mCnpyOpSjttdpNYeyHa7P3uucxZDHsmz6K+Nt227s5Zohoc7j80NHJuK8khWnr/',
      'uVdLvNDajZQ6Dz+nPHy/oeF+Uf35UeWuxH1r8N41f7ykvjW7c+z4AublF+E/APJvfwfk1XTno1ufbFsAbonoNvC5Fuinq1YWfRD06/rmi/qn0jiO3cVVK0hf',
      'A4LNfUbCnZfmkX6F+g8JdDXDdh4AAA=='
    ) },
  @{ Path = 'src\components\CashSaleReturnModal.tsx'; OldHash = '9a64561238ba90f1e2f64d0a3acce73077de20b11b82bd4f455a45cd55959ea5'; NewHash = '988c68534d6f813aabb2e9fe749e37cc6d40647b11d6693c5767a17a5c085042';
    Data = @(
      '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'
    ) }
)

function Get-Sha256Lf([byte[]]$bytes) {
  # hash ignoring carriage returns, so Windows (CRLF) and Linux (LF) copies compare equal
  $list = New-Object 'System.Collections.Generic.List[byte]'
  foreach ($b in $bytes) { if ($b -ne 13) { $list.Add($b) } }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $h = $sha.ComputeHash($list.ToArray())
  return ([BitConverter]::ToString($h) -replace '-', '').ToLower()
}

function Expand-Payload([string[]]$parts) {
  $raw = [Convert]::FromBase64String(($parts -join ''))
  $ms  = New-Object System.IO.MemoryStream(, $raw)
  $gz  = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
  $out = New-Object System.IO.MemoryStream
  $gz.CopyTo($out)
  $gz.Close()
  return , $out.ToArray()
}

function Test-HasCr([byte[]]$bytes) {
  foreach ($b in $bytes) { if ($b -eq 13) { return $true } }
  return $false
}

function ConvertTo-Crlf([byte[]]$bytes) {
  $list = New-Object 'System.Collections.Generic.List[byte]'
  $prev = 0
  foreach ($b in $bytes) {
    if ($b -eq 10 -and $prev -ne 13) { $list.Add(13) }
    $list.Add($b)
    $prev = $b
  }
  return , $list.ToArray()
}

# Line-ending style used by this PC's copy of the project (used for new files, none in this run)
$refPath  = Join-Path $root 'src\app\dashboard\bills\page.tsx'
$useCrlfForNew = $false
if (Test-Path -LiteralPath $refPath) {
  $useCrlfForNew = Test-HasCr ([System.IO.File]::ReadAllBytes($refPath))
}

# ---------------- PHASE 1: verify everything, write nothing ----------------
Write-Host ''
Write-Host 'Phase 1: checking your files...' -ForegroundColor Cyan
$problems = @()
$plan = @()
foreach ($f in $files) {
  $full = Join-Path $root $f.Path
  $newBytes = Expand-Payload $f.Data
  if ((Get-Sha256Lf $newBytes) -ne $f.NewHash) { $problems += ('Internal check failed for ' + $f.Path); continue }
  if ($f.OldHash -eq '') {
    if (Test-Path -LiteralPath $full) { $problems += ('Already exists (expected a new file): ' + $f.Path); continue }
    Write-Host ('  NEW      ' + $f.Path)
    $plan += @{ Full = $full; Path = $f.Path; Bytes = $newBytes; IsNew = $true; Crlf = $useCrlfForNew; NewHash = $f.NewHash }
  } else {
    if (-not (Test-Path -LiteralPath $full)) { $problems += ('Missing file: ' + $f.Path); continue }
    $cur = [System.IO.File]::ReadAllBytes($full)
    if ((Get-Sha256Lf $cur) -ne $f.OldHash) { $problems += ('Your file is different from the expected version: ' + $f.Path); continue }
    Write-Host ('  CHANGE   ' + $f.Path)
    $plan += @{ Full = $full; Path = $f.Path; Bytes = $newBytes; IsNew = $false; Crlf = (Test-HasCr $cur); NewHash = $f.NewHash }
  }
}
if ($problems.Count -gt 0) {
  Write-Host ''
  Write-Host 'STOPPED - nothing was changed.' -ForegroundColor Red
  foreach ($p in $problems) { Write-Host ('  - ' + $p) -ForegroundColor Red }
  Write-Host ''
  Write-Host 'Please send me this list. Tip: run "git status" and tell me the result.'
  exit 1
}

# ---------------- PHASE 2: backup, then write ----------------
Write-Host ''
Write-Host 'Phase 2: backing up and writing...' -ForegroundColor Cyan
$backupRoot = Join-Path (Split-Path $root -Parent) '_backup_returns_display'
if (Test-Path -LiteralPath $backupRoot) { $backupRoot = $backupRoot + '_' + (Get-Date -Format 'yyyyMMdd_HHmmss') }
foreach ($p in $plan) {
  if (-not $p.IsNew) {
    $dest = Join-Path $backupRoot $p.Path
    New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
    Copy-Item -LiteralPath $p.Full -Destination $dest -Force
  }
}
foreach ($p in $plan) {
  $bytes = $p.Bytes
  if ($p.Crlf) { $bytes = ConvertTo-Crlf $bytes }
  New-Item -ItemType Directory -Force -Path (Split-Path $p.Full -Parent) | Out-Null
  [System.IO.File]::WriteAllBytes($p.Full, $bytes)
}

# ---------------- verify what was written ----------------
$bad = 0
foreach ($p in $plan) {
  $now = [System.IO.File]::ReadAllBytes($p.Full)
  if ((Get-Sha256Lf $now) -eq $p.NewHash) { Write-Host ('  OK       ' + $p.Path) -ForegroundColor Green }
  else { Write-Host ('  MISMATCH ' + $p.Path) -ForegroundColor Red; $bad++ }
}
Write-Host ''
if ($bad -gt 0) {
  Write-Host 'Some files did not verify. Restore from the _backup_returns_display folder (one level up) and tell me.' -ForegroundColor Red
  exit 1
}
Write-Host 'DONE. 7 files changed. Originals are backed up in the folder above this one: _backup_returns_display' -ForegroundColor Green
Write-Host ''
Write-Host 'Next (test locally first if you like):'
Write-Host '  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue'
Write-Host '  npm run dev'
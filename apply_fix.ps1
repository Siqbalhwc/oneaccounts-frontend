# =====================================================================
# OneAccounts - apply_fix.ps1  (Cash Sales rounding + PKR display policy)
# RUN FROM:  C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
# Changes 3 existing files and adds 2 new files. Nothing else is touched.
# Nothing is written unless EVERY existing file on your PC is identical to the
# version these changes were made against. Backups go OUTSIDE the project.
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
  @{ Path = 'src\app\dashboard\cash-sales\new\page.tsx'; OldHash = 'e84a6852d76f50e857e82524a0f01245de54ac7e81bfc7a78b60e4cfcb762f12'; NewHash = '7c8ed3419d9bdbb851948d55659a497c5df2bcdf2d3bc0ad73198759bdb1f2db';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\app\dashboard\cash-sales\page.tsx'; OldHash = '618972939c5f32e64186a1f207845677aa0d5bef5457eb4703497fe334db102b'; NewHash = 'de090ce00f9ef60c16009758221236d263353bc888182d00ca3b35f73954ba10';
    Data = @(
      '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',
      'AA=='
    ) },
  @{ Path = 'src\app\dashboard\cash-sales\[id]\page.tsx'; OldHash = 'fe1a04170baeba3e7c396a2dec7a4b4eae93ec4538f8f9617cfa3b8ee99bb656'; NewHash = 'b67496cd0967387cef3d0693707de9f0810db5112215e52554dadd1a119ed6e8';
    Data = @(
      'H4sIAKXGvWoC/80823LjRnbv+ooeTLILZnmTRiPLkkitLpxdlceyVtLY2RpPcUCiKWIFAjAASmJoVvlhN69bifOYlN9Slbc85nvmB+JPyDndDfQFAEnJznhd',
      '5RHQffr0ufW5dDdoTRNKhr5Hg9Ta2PAmURinZE5Gk/QP6YwsyCgOJ8T6bcv3Bq1RGE+ctBFMJwMaWxI4DqeBu1XHQZ+HAZ2xp0snpcb4CXbm406mcUyD4eza',
      'ucmhhiH0BUBL0lK6lamA2qsUMNfxqTca0WGaTxJTZ5jqsJfhNKUxA75wYmeS5MABfUhbgXPn3TipFwbKsCHgSelxHN4nND5hkpF8JNPIGTgJbSWJKoGjGMBf',
      '01FaJxexF7A5r2jg5gP96dBzacMk8YYGNIbZzoK70BvSi9NXhsgid9Ty8s585CUdhrH7ey9Jw3hWJj0NQJfJhe8EyizDEMh9gCHYfsJf9AEngNYJZmVjRFdx',
      '2A1Nvxo7aXIURa+94Nbg6h67nCgyleXTskmw3ZzhxEnGV45PL2k6jYPPQ9fxS42oCFZAcewA4yBeZzaBMQymDgT1HkB4XnCjd2v0FaYpQYWLCu1h5AxpPuVZ',
      'SidkvkGI5+4RvpzgxaXJMPYiNMc9kqRgRzfQ+k06U2CmgZf2oxjMQWlMw9TxlfcoDt3pMO1L7ORbePB9pW8YuvRQmSZrD5xJabs3cW5kR4ZvUcZdkbMEWvtB',
      'qKB1weiVV5MD9g403iSqfLxkCJ4m7TsT/HOodPGWfkyH1LujrtoV0xFFR6JxFYQpTTQ2nTidlQqMuwO3P5ip8Ak4oamGIWYmBoBOWhATYOELBWZQx3hgB4hE',
      'tYu37xB8Cgt3QmPoQ2ECwaAWZSAidPWGaAzGeGjAgFDiWUHXIC/XjWmS6I104ni+2rRA/dIHtlpcOnKmfkpG02CIFprTfEpTGHYB1mHXGLGwbpMUYwLYBelI',
      'L2zX8s6I++KO9MtKJxrLmQudHOqw6bnESSRVAko4YoArcdg2F0kcDoHLJg3umue9f7zuX7w5fn120r96c3F0fHTV67+5fP2svh7o0fkX5/3Pen98BuC1jZyM',
      'ORk7ySuYfxqj7+pkDlbhZ54p/xx0WM9eIKz5XgDvfngTvon9bLDwqLYyx1uUSJ0kNEV5v+NwLAoe5EuOG1rXxn/l1G/90HFBamzwa/6sjrfTeEoVcEHbmcsG',
      'nGRv2pRcD13bslQWY+67O5kfV/gfOgF3v9DLwDqdDrEcd+IFFvn2W7VtyCzWwVREMj8O7/l4LoL8VWNk5PgJVWUWcR+csEHCIScaI+UO/u27rv32nSKTgRPc',
      'HnHCOLJjpUFDOFec3j7BcX112e4TwV+fg0gvsSiZlNEkghGbVDYYk06YJ7CE7wOREou6XmrtEyEDmKgymFXYTUzRcj7DVA4mv8zeNJG3mbjzNMyG5d/pCneV',
      'rc6mM03HTUgG3iToAJrpmAa2PUf37+zxqB8DFQtlKHjFEbGfYU9NOFXRLszJQ99gY/9hE3KI/gQcEOJDJwHmWjtsSmerYIRxNc2qWQsDWOCfRZ2gCipZYlTl',
      'CwQN9xn3VBqVcp2JtaWJQ5DTxBTCtoawePuII7FqWU9CfZzY+gfZRL+xLc+16sIxau2SUyv3LApIAnSItcjemfidZBYMiVCCIXrBJvaAM1e54QtsX/AKoSEb',
      'ILSSyCgG6kEEGxrOYdLMYmxNmU56EG4SGPiYH3HuHS81BaeLT8RIKT1DhoHwty78y6JjXYuI9SwK1nnkM9HkcldJN2bS5cvYSZoZYRiakB0wFaiP6AjcvZtD',
      'LjY2yiXAcoLlIjDtp8/GaPSXGJI0GjlOsIeMadriRPzqV5yapk+Dm3RMuqRdpjuRIp65GNH5gIkT2ba3x9Yj2pfXlDlprTnyfMwHbHSXOYRLnnVI5oZUWiT6',
      'SjpMGYohZWIUsssgDKUrgvPczHa4HbEEuB856diqNb1A2IYkrlZCj+j93In2RMl2wH1/HfnuAnHzhTZM4Tep5Ww0ofDuOcOxbUdSYHMF+9sIVIjOOeK+TDNH',
      'rktdM/CoYDJEIGlHjHISHKXo8Z0xTHgGExuItMloqBc61FqEKw19t0txxVhWNTyPqhwen1fBM9VlA6QecZhIz9X/dI1o8lwQCl7QNL01RGybUqmQiS6RIk+6',
      'BKr7BccF7hY1jZ2NJYwpbL19V+a2RD4Knr2mtukBo8rLQWryWCeXZXTlfg6XK68C61ne03fZRhFLxLLUC8F47VaXleG6LtIEWhp8GRiseHB0lkqQhZsLTjKk',
      'AYppj2CaoFqZkq7aTEpgpSIxKRMkcreeJFU5LBFinrfWjXzVeooAWBBNYNoUc9M6yQqOnFc1m7Y5M4JhZf1hbqbWJiwRQgVmeamS+XvJpajEQSbPWI6GgQz/',
      'NrnmebGR1euy1Ahoeo37DjCOjToUG5u2zQazPQkkDoJPg/A2Y0uC99bIHmnnWHnPpdiZKOBmaIztC3J4SJQp4a2t43Sn9IhP2CGfgycDl/Ngt+sZzpyRhjF7',
      'raaICQrv1GPcPlNkBqKS2LsqH0yFmWmy8pw/ZuE8Yo4uytLwTNjPuLDvIFEDYSuKunfYzqAQSKaiLHli6j809xFtaToqcJOld2YYeH9KnZj83VwHRdNe1L8O',
      'vg7+GE5jgiudUyAAxV7VgoQjcvHZJTRn29qKGdQWWPeTAaUBWCEGduo2EeePP3z/Z/KlR+/JFwHW93tknKZRstdqQanSBCzZAhzMEu8bKPOwWGm5QMQgdGK3',
      'heQ0WE3QEvR47oKh/Qs5ZXtmohldyQJnvB7DoiGzcEogS8C/MRlMITHF3Yyvgw/f/RtQQrMVRgYzcsXmfS/ExNcZxhKpGcDo+pRtZOOONLgWXjKY1RASolU/',
      'ohaQ+W9RpdnuzUBdajzSHDZjCtGLwnqDdItNlpDfQO7IRF7HRYDri3vCVgssP1LUx6oZoDgkUOUQsWdOkH6osiEmTmOqEBC5o1Mc0MljnrJJs6e+6FYlOo54',
      '5bBX7LlASyxp72GJUdIu9oH2jHd9VrFHlL1m+r2eRWKqrM7lXJ/jTqtiy9k4semamU/ePKWnRg8XsBQuGnsQIiRxs9MX6Jnw12z6TNFChtkepszRvnL82w/f',
      '/YsXkBPRKcUhGnLJyuGiTDMUIbqFvCV0iSvIOoUOJCyr+zJYASzc2jWNJwnPoDI0bNNYSIk9ZwlkPg/fKj6eCSC5dczmgLWYk8Sd496SsATOz7rMX/aIrbll',
      '7BUOHDvhGYJwTRoCrqc9EaR4GsejKktOscHISrWzB5boKy2mY2VHEgwIntialH3qAQUDkQ0GpNjzZ0Aytsp+magLIC25NWWvn3po8FlJUQ7OU2ltQFlNkToP',
      '/ZitkrbeyCOs0gw5dq7l6UBwmTm8rCdrziOK1nHtPCgII4cVylokz10B39A7nQJhuYHwTpGqi4whHOYpYvHQ0RbukAcDgAXPcUft99mOTt+IjU2Af88SM5wD',
      'Y4HYaM6iATlwvTsw8plPO3OoVGEJs2R3axtSQPqQHvneDRiaBVlwik4A+Bje3rD0BVrvnNhuNAY3NeiYeMHvqXczBglbm+323Zilmn4Y53CIrzGZwkKrWWSx',
      '6IoC5MN3/3nQAiq6GyXR6pek7yT3quBEIGgDTkFofopEeJ6zhMhH0TMKg/SVM/F8WLbWr8+QpV9jFh0kjYTG3qiUZE6sMLMDRkV3/j43/eYQ0hWoQlRC+GDs',
      'qO2TAat99shm9ECS0Pdc0c3bc4BGDNpCT7i5FT3sK0y28XXixDdeAGNS8NgAs4ONg/ChkYwdN7zPpuRvjWQCaGVR27yJPbexBaxhteQlke+AALBxn/0LbE6g',
      'LaUNAJlOAiRiFOP/0I9bNnw6BaHvDCgiQ4E2Eu+fYNFtMjpZw72Q+yft9n4m0IIJ7DP7aqQxSB/vU+yRaRTRGEIt3Sc+TUE3jSRyhkwI7WZ7m04KYtg2yLpz',
      'fAjMOlnbBbJelpKlSyx1Bj5t3MeQWc1JCDn7yAe5gjNypmm4TwDX4NZLG3kPhIjQ93kdG06HYxUZwwVo7j0XXTgY49/nSgcyfCdKWNrDn3Im0zDKjAFsuSFG',
      'A/E60+kYUDNROnyt+nSUKvaDehFoyk20MUYuao/TXUHxT1CmEEFu01Xr434MQYkNx52cEJWiCQBXXym7a+JXeXmBA5fbRhrvMYnxiVfIVDGpQRqohO4indsK',
      'ndn6380NVqVJU84OU840TpDMKGQ3D/blyvZYxdUY+RQGMqtoiDyIu3GxqtmiZirzeLrTbm4lir9qvqz0WArTDEHkxIB5pcGMhO/1gjG421RYjYt1o8NJCCBn',
      'NaUmxP1IWTcg1YKVNCsdJ/pqBsWiOdO5XKMFkMrplhCbYa+gN5kO8eTdGPp86+Xpi52dnFC2GEzScqBylKU0Pd/aOnn5sqePcdwbvJsltkDmBZMa+OHwVg1O',
      'aMTtEiPmK1C14q3y8KCRtHm63TvdzXl9fnrcO3pVRiJmgh+fvPbOy1fbUhXPd3q9T44/KSWP7yh9dAo/3dput3uSwlenvZ3dI41CvkvTGIsrc2WGOrhpJOEo',
      'rZW7JtWDaZjHeLFvEg48Fu1kx28n1PUcYk+chyyK7WwDz/rRlZakVGcl+9qxhDFnLm3TjcggrITS7d12qYy1YeO6EWB2c40ppwbi6f3ioMUTxKz+1DPXnD4L',
      'fTNkm3+CCtwb8WuDWDtZLMo1BjS9pzQAAOa9z7jzlkk4zxCORWDDNBjxfRWjV7cwPgIMT9y2lNx1JTXlk5UhAlSDKcwekKHvJAnuc3Qs8DgWCYMT3xveduZ8',
      'k4zffmpG02RsW6Xbe1Zt0T3Ir40SVERnvrmzIK3uQYtPos0rKhmlZbwpeUJlXjFdbm3xfP8rsVh22+3y7D4TJ8S/vCphp/fP9VrvoDXeNGaO5MTVpU5dIWrz',
      'hTGbvie7fIcIKIg0UbQ0WZivy3XNtLprKHVubIA/Qcnvy/dwA3p/6LkduZX7HtT+4d//+r//81fSc700V/ViCTn6xg802Lo6SqklSnAuUG5cKLKLl4gWQOeP',
      'P/zrfxOx4UAEfJlt1pYRL29/rS9Y7ZoXv0ezIKmXgk6tV1PfnxFxngB+ykvkNqXV/fDP/4Wi5SPLhWuoGjyPTo+WCxgYKVTqOEDHKA4yAJu8C2hb2R3nvtiU',
      'tWolqnPIOKajjkABTMIioWnH6g9A2rcWnnB1rCAMI9yyAffOjixjWBRl2hZpj9U1DoUP2E104WG20cOQ7ExFp6blVKr1UUamnx8sDO8hLsjrBLFG3K3XFrpp',
      'a9pal5sm+bpXqMMUWZHEwfiF9ArcFV1jodnW3NSO7js/WeU7s1DEw4R0ofxObAKu84XhmRQK88BvrXD0xji2CWF12UTnoeH+ygaw7QGra7p1Y1yxYV1K8PDg',
      'sWSw46ufkYYsWjyWDhmC2C7xIXlvnhdi+4J8+O578p4dky0eGbt+NhbZ/vHa/JXlBpu7S+z7+Wb7+NPdTbBtVmtd8X0Hi288iGj+pRN7TpCeT4E3bwi9kF5O',
      'fSfGT4IStl94oH7VI1b4Fq7w8lPU1eKZLzlor4iHBQlVW67AWiLV9eS6WiAG36V8LMq0ajbVjCiWHd8X+S9jpFu4HFUhkuyAoVQk6wnlK7ldU3+0lIwLC4ty',
      '1VTpa202T6f0Z+BQX0CvXn7aax9bj+c5T/DWZ/egVW0bcoGxL2h+8io5CZMUb0P8Lgzd5OMtFcnBExbI2l71d3GYJJB+hCMvfYJzLXrPJ64AQ6JSFtWXjxQV',
      '83tHi+UCenrouWIH1CXiUbPpw9XJ9GXv+s3lee9UZNEQT6UfqxwudpWs7sXR5fXZ0Ws5uHKA5yL02WlJtl4MMHpBwCSrfMvFigQcUukvxdgvAo56abqhIBY2',
      'zf8trt/8cuJqAgTgWtML2BWT89sNKyY+R6A1JmXIKiZcktDPlbsLmV7M2+i6W1tRAnycIoDtI+mJf5EyecxmFGsHrKfgXtMxddySUJXGxUYG3r3gVxkOWvBc',
      'AXIqL3gsAZMCKzkXR4b/kM4ePTxG0bLRbwIvxeIP7Ny++Oyy9hNQ8QtlS7BAa1wMraWyPUgHoTsrolCMUr9JU0pyTG7prDNnd0s8d1HGF4K5T9ub3C0JG9Kp',
      'FS/MHJZSKYjwJpCux8NOycAFEJF2LCXoiY3kLSgnxmKV4HM4+BMdpq883NAd4tEL3ptgO+mXYiN9G0gmrSqi8Y7rEhK1jb0KEkquRShnZY+lZ1HRweNOVc67',
      'RC2mYmTNWWjmJafRIS8mLbAYNe9pVdLLw2C5+bVSdw3DXH6lpZSrwi0yVj2vOV+Fs5nz36Wws8tntafg4y7jMWk6/paFbdxm+8lT/6QySd6aq6ajzN+BVRfM',
      'GuCK3g4azVC0bOO9ln8YMs/vhf9Nx+nsE1jxExm/fMTmu2hPjn7ihGBVEFXTxWqgLN+vpkYRjXIWaXX//yJvblbs8yrlQ7ilsTdaGni70K9+m/OLLulIfAay',
      'tmNZ4ZMjpYbIrh8vR12ZTUTGFWXxMUdllFurFPyyd3mVl4KVqPaIPjl+2r5sarKskMS6sHd6dr16WrKyvPziSqJZPCG0VqygVet8pYr0723Q8xoncktSLH7e',
      'skQoxsHdEsjitVVrW1wh0I+G0RsvwbPuySX7yYP807899iVsNd5lisdz2WoRlZx/rpEz/o2FaPXnJbLiWn6BlX/VZ4TtJb9ypJCA+uhoMzSxSeUIpwHT0L98',
      'dsVteM/VP2qVvx1U8kWL9ilNP8chG3RAF6/JF0iTjoUtF61f2NOG6WLkmfxvyDn7PNIuG5e59A3Ttxh39cV9GlVIAoMhStGqAqo/UILQ8k2FwnUUJrRqHbEP',
      '73X4U4hKGfi8fMC+9usg9i2C3oJENmsqL60SC5S/6vJ4+1N+zKtoVJohVRhP4UOoks8xlhmVrqiiZJXLC/wr6GrB3nuBG943/XDIboI2+Setdm2F9IS8lufU',
      'RMvMPnJ+/eMP3/8HORk7wQ1dN8fWr+iZebb+k3fM82Ws5j+jIr7FPHM78yv20zriAyi3ZpT5K/yk1lbbWPwf1BO0syVRAAA='
    ) },
  @{ Path = 'src\lib\money.ts'; OldHash = ''; NewHash = '6187cdf4f1ad6cce1ba8c4ff319e24a03e27e7d3067c8ac7c4d35b3b379ace79';
    Data = @(
      'H4sIAKXGvWoC/7VV30/jOBB+56/4rg+nZEnTX1CkAntCuyChA8oC+3BC6NakbmOtY3dtB9pb8b/f2E674diHu4eTIiWxxzPffPPNuNfDbckMn6HSiq9Rcrnk',
      'xqKLqeInRaFr5SwMvWZCLfArZsIuJVtjqaUo1vlOr0cP8A4nVbRNgqMUTD6ztUXJnjj4ihVOrjHEjBeiYtLmuPE+wVlRQgrF8VxyBeEgbHAIFEwWtWSOsCUB',
      'wDDNoLSDVuTqhzlsqZ9VBqthC8Np+Rgz5tgjszxvwH2qmXLCCW7BKKohr/EcmKPMrcNoCw2J5Rzzyn1yawiFuTYVc11VV4/c5M6m+T8yJvoiBjwLV/qTl56C',
      'CeZiReClpkx41ko+gyt1bQmJRaGritmNy8717zcdn9PV9A6GL3lIXyvwJ27W5HBRGz7xeS80ZaBVwT1ERm5kXSkqH5txk0GbsNcwqfjKwWmKyrEwngCnHZNI',
      'astx9KE2hqtifccW6L3H3OjKo1pSDpRdr7VNya+22d8upXDOi4I17oSiGEtmGhG4khL1v4oEldGuJSNZeafpJEqqScsbNVADg7HaoVILQfLxuCWfO03Wmzwu',
      'Tm7vwsFYLuvRxIIQQu8s6ous27yXTM7BSJgxzb+40XSeVRzM4pp0sDBE683089XHZEUlS8kZXy01hZnXqnCCShHRJU9M1lQKptaUTRQHvu+QbDUlCi/Cq7AY',
      'DVPaEXMkv8TFXNgzoYTjiUpTKrSrjUJ/e9qKhXegcIQ+fkN3gAkG211DW8HiHZJL5so8IEriN3u05BO7TfT89Pr2/GJ6lZLxoN9P0Qsv8tUEJWfHxyFKn4KY',
      'nZdAHjX/K/X65oq1mvEnUUS921CIwJ4rSQhBGXfUhVRE6mqiXrKvJSlO10uvk2QwzEZ72f74IPdIipKpBUeHq+7n244395/nVx1SMXWU7/J8J2Z8Ob06/ePP',
      'i+mHk4tTSr450myGeXNWOU8Yf8a5cjKPyZ+Fzk3apzN8R0XMV3V1Zlgo6EexEM5OMMxQsdVPd/CSNsH85PhfY418LE/kYDjay/fRfY/OIAvf/Q41SPIomfpK',
      'ZRSKhCVmwaBPhHbSN0rdTKLXWrXO+Gq81mpb1C11bLjN4xAkZTUCueamW5OAsTQkh4kfo5IzckaZvR2pOfbH+Xg8Pghow/dBJ8O43w8L9PYJ/Az/DfH9L+D/',
      '11aLjLW6IJZ1k2arq1RsnE3n9DcEhPH3evR9CbPvC/i3mpaG3SZ7sHhPHIZ22V6l24EWJnkz1aSn0LsJvdQaagnFzjBKPV/3o1E+GtHfj9fewxvy2ocDyM2U',
      'ikPZbn630+v+oUVquPiJ2MAESTUZZPF7LrU2SfCQpltzf9durKNFc2XH0K3pExw3ZG6P69q1UBzj/oG2JHegC2pG/96SSoPErwm/cEivowZlFwP63d1Nqd/I',
      'U76sbZl4ROnhxkEDJvztBrQpXsjp1rwxeA26G46nrX4ge6r/30GnUgM1CQAA'
    ) },
  @{ Path = 'src\components\CurrencyTag.tsx'; OldHash = ''; NewHash = '1ea659011c611c98f9b1cd9656734d9b669e04ac1918a6d004e15cc80b64ea80';
    Data = @(
      'H4sIAKXGvWoC/y1Qy26DMBC88xUjTiBBSKS2B5THIeqpUlslrXp2YCGWjEHLOgpF/HtN6Gln156Z3ckynBtlTILGCZUIP99OIYy6kFnhuyd8vB9fYekukBYK',
      'NStbeijKIGoZ2vph75pG8YArqZI4ToIs85QbMVqLuQ6odO2Ylu+iLoaQLrVH5wRh5H3jcH6XK6FojWvsv54f9uLRKqB717KgpEo5I6icLUR7i6NjJlsMX6qO',
      'RvT6l7DDZoMpx9IecljXXLzWFGMMACZxbBF5CGz7Tln0MhjajSOq1srZk/IHNXn0P6Trq+R4Wa+TebuWc4Q3xVGais8mfYQXhwkMiRCfO1VoW+dYr558sopr',
      'bU+LwjOmae+P3Waz694vEAdT8AfHK0ikhwEAAA=='
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

# Line-ending style used by this PC's copy of the project (used for the 2 new files)
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
$backupRoot = Join-Path (Split-Path $root -Parent) '_backup_cash_sale_rounding'
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
  Write-Host 'Some files did not verify. Restore from the _backup_cash_sale_rounding folder (one level up) and tell me.' -ForegroundColor Red
  exit 1
}
Write-Host 'DONE. 3 files changed, 2 files added. Originals are backed up in the folder above this one: _backup_cash_sale_rounding' -ForegroundColor Green
Write-Host ''
Write-Host 'Next (test locally first if you like):'
Write-Host '  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue'
Write-Host '  npm run dev'
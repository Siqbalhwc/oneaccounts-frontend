# =====================================================================
# OneAccounts - apply_receipt_polish.ps1
# Receipts list: in-app Reverse dialog and messages instead of browser popups
#
# RUN FROM:  C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
# Changes 1 existing file. Nothing else is touched.
#
# SAFETY
#  - Nothing is written unless EVERY existing file on your PC is identical
#    to the version these changes were made against. If even one differs,
#    the script stops and writes nothing.
#  - Every existing file is backed up FIRST to a folder OUTSIDE the project
#    (one level up, named _backup_receipt_polish) so git never picks it up.
#  - Afterwards each file is re-read and checked.
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
  @{ Path = 'src\app\dashboard\receipts\page.tsx'; OldHash = 'c2b8afc070b492b43041c9fca77d78ff6dc9e168c6df6829f115d2e301efc52d'; NewHash = 'dd15311815b40beae79566308bf51a1fb3feb9d07e314f1d54f93f84566f7266';
    Data = @(
      'H4sIAAAAAAACA8U8yXLjyJV3fUUW2naDYxIEQHCTRMmqpcMVri5XlKqn3VFdISWJpAgLBGAA1GI2Izw/MIeJufs257nPYf7FPzD+hHkvFyABgqS6XBPTiwQk',
      '8i35tnz5MlP/81//bawyRmZhwKLcODoKlkmc5mRNoPUypzlr49Or+ZzNcrIh8zReEiNldAadi74zaMjZ8zS+z1j6gqMq+v4mWyV0SjPWzbLUqOB/H69ylhY9',
      'I/aQdyN6F9zQPIgjre+7cJW1yatHYOaVH+RtcsloOlu0yUUKNL9LXsb3UfEiH0Tbd5Efu23yYsFmty+CdBYCiouQpbl6+UNBPlzNAp916mPjfIasHE93Fkc5',
      'sJp1sf2FeKkCvAtp1ASA7dsANyz/fkHz7CJJ3gTRrQYYBtPuPX6iSVIAXMxQOpdhnGcaBfgWgdizrvYZ1Jk/JoxcAtg3AQt9MkHdzViQ5FdRbJCfiOGD4vjD',
      'bJXl8ZKl/IUu4xWYAz4uWb6IfaPE9DJIEQ/NZgIBg4ejo/kq4oTJ5S0LWR5H7+N7s0XWR4SkLF+lETHhkZDTPD3jD4SsPw7sNunD/0P435PPI/uTtaSJad63',
      'SdAikzMJKIB9csseJ+tgQ7L8MWST9Zok1PeD6OaYGI6bPBBnkDwYZLM5K6AAzg/uCgCtnZD7wM8Xx+T6F+v7zS+v22TBgptFfkwct13pN6Wz25sUhOIDnTua',
      'mp3O9KaTxfO8ZbTJNE59lr6nfrDKjolXBaVRsOQGDZDZIliCjIlj9TPCwCk6QdQBLyBBNA+iAFShgW42pFuO4rSb++qt1docyTYuzdbR5uiIPXDz8NmcrsKc',
      'FAp5LxSevaM3TGoEDDLLiXJM0GaDAwupJ2k8Y1lmsejOevvqDx+u3n33/M3rF1eX3727eH5x+erqu/dvnrWf1vXi7e/fXv3u1Q/POMeKi1QEgUkZEMzy4xo+',
      'c9+bKD+sfFzQ7BtgfJUWXdDDtC4zGv1zwO7hG8czmaDh+ssgAtP9SW+bzdDgKYZADRaDzc+CLYA/SjeDsJWxXKngk2CSx9VTGj1+/HRmfvxUsvsxjCnaMgd6',
      'I551GDNPV0zrnskwCL1FRKx0Ngy9q4oBord6q3BUtJ6ZIi7U4MHzC2h43oKFNoTEgKBBYmyCsb4WlF+ot92sTmkUMUHpOX+sEFoTjEToS6sZ2hsPQgwifmqc',
      'EIysx+DpKQgOTOInEq3C8MzEny1dN3cszdgHmkLolQrSWupa2gGv9PRevVVGNKdhBqoCoGL6NE0ezkQACubEFAM9t3ho5bakxtQiKkwJkmiFQOpDsGTgIhJR',
      'IR/BH4ZO225JOBV0eU+Y6WiqgHPRRUQQ2Q3iGoMAxHxo3LSVCnTLVNPDtzQReizfK/ICU4dgeBqtllPU4ZpEdMmUSk5IsoBpqnzlnpM+Xs1in52Xijs7M9eb',
      'PcJTkcuiq3xhgcq+yzBsWPmCRaa5JmC89FhMxZhebDTQwrsDnA1N7HFuwfR6BfMcRThCMwjZj61zSxruVeBLSNQZwLUqdsxbhERbUnqfDuj9WeESLamAyqgk',
      'NQsnd7OYlzNDqdbKYIYFtEYALoXibQuxtiviLLuzPwGWYiwGdlPkVZcgQ7+FeZv5VzSHLsri+VddrDVhigHhhxbRZ1YhZJjHj8mXsQhQ1nqjEUCS1jxOX9HZ',
      'wjRnx1xnnDOk+nFmBTzCKGozC39j4DaMtqI5s/iDatVJ40f9nVuRRr7qASaQLL8qNgt7KOR90DBwVqnYhDAXOYsBn7rprLVZQsabE+XQggftu5o5dpmZmq+2',
      'reyffpYl8UzIzMqME8NamVueEyOhac7BCai3nJXW4HgzFolULlN55kRlmpunWaM22XKrRJmJGbb4XpVYXVeogbbKG7QBtnVeJXtCncLU50EIqQvDoKJEaYk2',
      '04SGuqLFzG2BdS/NltI4QSUdaTEKxPYWzRYClRZ/MbewlBQ/nWuWDREwfhPfQwoH+jVbeoRHmDL1P692tIJoFq5g4jYVX/rXFiJXvBzoesRFWaaYICjmf1PK',
      '5qNlWUpUnyz8bJoUEmhNPhCFyB0NL7hLt/HxOX8shLfLuMoIhOB1odGni4wjeF5HMH06gg1hYFtNzMqF1Rarb3l0NKklOnCR2yeKD/l1WvmqU6phu+RR06Rl',
      '1veJnJ8fGq2Emj4JalOog9M85UgKQ97233PSccDhnSrY2WEwhOo4uinbNSPL45yGyusxUaoYnRWy6CZfVHtfcDlu95Uem6I1plYGGc0qI8+Am69lzuh/3QI3',
      '8lczZpqQ26ciESO/JmYqlcN1A8mYrXG4oJEfMkyR0ajmKNrjclVeiw1Vi5mLHmXWbSbACkKI35qkROYN4uINQk3COiopv6APU4WGU0BwpW4Krm/E99fw9rPY',
      'flayLTV2qtVpSBb8GZbhjqst4eOEzoL88ZjYVl9b9u6xCoVRw9Y9g6GfFrWfyhc+rpo6ZM6PQ5OB8TUMT6Qp2tjkKpXNqpE98pWVBEJRBY5WIRIe9+urC95a',
      '5WeewoLbDx9lv1e4mEG2ltmNyoC2GFrKDruDEHKwLMO1QUNY5PuPRFmyUc47xodFkKkRYB4EWozinExZ0fuYwFL4HnJjbJ9jIaRNgMsApQkJs8Q9ZSwqQCzy',
      'LsQaBzTMU5YtCMzcJKE3DHwQxALxEdx1tkpTLBcKX7MMXfHXHxZsP1cW+cVaCUESg4yN0BsaRJaxua7KGX7Og3RZKp5mj9GMbGdhur74Yl8t8Sq5WdUyNJCj',
      'IhORYFr2pUoXfMXKqxb0ngZlMcZKk5mpos2VmrHzlEYZ5fWcrzFVSoovAWgG53ZcCyRXZXJ2XKYuKneqcKRlP1sWWib/KA7OaTlhlavOYiUuVt9tufpusmaB',
      'xFrC2hb03yqzOU2cm6N6AqdHOl4T3PI4fDwHeUBWgQUDbkPHWrAGAYN4WsU465yr9bbi/VrSBrOqJkwbbuY180bzVBkCpC3+DfyC0EKmNKQR4CU0ZWSVYCnF',
      't65ljqklRyAmVfiVUUhbxtTyQCzS7UoBtZUCdDkXqxq5PtivK+H4xRgW3L/F8khGQgLBH2ZFhkkvd+CCY6nMqmPCmHILs/XaSkQ5oF8ks9XlFTrwr8eugbNr',
      'ElKYXrs/vuzetIlh6H4jOBOiEMPc3x9jw4Rcv4RUFVTKoTBzg0T/h3iVFrFlW9vxnLz73Xv5QUzsImeeUZjIRaLUqhgFLnJBzT+KpdrvozDAJeYiz5PsuNul',
      'SWIBt7JWmE0fs+BPYCZYY+hKul1BLPA3P0YvwWSOJXU0H2j6ALPWLXmMVxB9U/ydkukKXBlLrj9GHaDILiR2Mn0klxz/tSaLEPcWJvXdBlOWDkBSpctj1xa5',
      'h0kuvrfiBNZb2ALCvZqCZd8aNUPOF5c4k+NSH2KU9eLy8l0KUGkesIyvwZtK9O2mmvqMpn5nEYODlWX153EO1omwAJrFIbi8LMDzz9hxHkf5JUz3vG7P376X',
      'dfyhbQtb/4ARFCSHiFYJMDeDYAugsNqAjO8SExDOoG3ZHlvypW0YpwVjiKKzXIEjI737RZAzhEGPiuL7lCYG3ydLL/mimbdGzNCSqdz/PBl9hgh6sGhCxGCq',
      'F2Fwg/sOy8CHjMfQlYZ53IcFeuNaZGsw5EUQ+jAbt0VmRjZYQ6unfSdFNzUW/vMtePGJgDtvHuRG28w5zRdl9gfBW1pQG58l7WID53S6gtFHEIhehMHsdrIW',
      '83WZU8uEVssnK5bFNaEkWb5D4pFxBSdxEIEJSBlCQxAtWBrk/w925QcZBLNHzgPGj848ZGgFFNX4OmdLmNyMGZPs3mB1zWuXlmM3W2ZlM2yttLchay3BVzJU',
      'Mu8KoZ+pbaaF2GY6aqhTVXfXSm5cT0hI2WDB924JIKeyPPO3v/zHaRcQnx1Vi2BfkKqgd7pwzy54FkBesihg/mkXWiTtrd1LJDoLaZZhLWRiYDbbEUJuZqVx',
      '3xBVvQyi30pbMhzbvltIc/uGLoMQLeDr18g4ZHsZGFgHQksw3zMKpTfOxdn6utD3b27Z4zwFZjOiNh/XxP4lqSy6vBNIlPr11hG2Am9NnctSLE6bnZxOQ1xn',
      'yu1UBDqRHtcBlkOaZFhSlU8nzeD5NIYlRJ4eg3zzDrdTCJuAVSKayiiIDnwIBZ9DJLSmgq1ZpoJnmkd6IB5hGPaSh2IkqdzgHWEbKquTyYhbNNxLnQ5s+6QI',
      'MTLCnJT+rbn3ifDuTiDcW9jriXDuASeu8c/XAZD3QaeTIqI5Vr95WjhR5rLlaScCUyC2pWkYgl7drC4MKcWfKcJOkgZLCquwJjj5rc6abBYGrVvOVpdtcgHW',
      'J9b/R2IqjKHfYAdcPf+Ikv8ICWkwf+zwAyI496gPCNPJFpBm3h5jHZAjKs4mNIrgM5QlKridIEpWed15FbHeqBz4Xhk2+Ug5MxGe1NikN2j0nWaemzQDbfEq',
      'F8m1CATT+AFxcTpFpHjYOdDjeQzrgDKqHDaybLXkxnmTBhhPCv3i+wn/CZwtoS1niG21jDJckyeM5iZd5XFnjkeWIOAv6YPpDOzkoU2cOaxKpZejaE4IkLgJ',
      'oiLIuXby0MgFmtBOLbc0VT1RUYJ6oSlnsINuSKcsxHxQ0529FfeGGPe4B+VlYlTkRfs8rTZ+bwcbdzRcsSobrrvFxoiH3wbb0TCivL68INHL5mF8D0s/yLlZ',
      'JO1zQX1sExjEWydbVhniU1gnm0FyhYJWmDoPEKHBjCC75p+mNO1IV80XQaQ3V0Ys+awGwx3kjo9BdNPbIO8UyPB4jZRmXRcHIDv5YrWcNop2l+zcGgU9pwDH',
      'UeMF66p1nFL/humTNoaZUUOsdmy7Hnmc5lm7Hr+nYTy73SbaUXWg2kDTmyk1HW/Udga9tjPy2rbl9MtI9tXYo73pqMm8GiB7rQbCzIcY0Ei2P247PbvteoM6',
      'VSDpzgc7qVYAq0R/swR6lJgQvJQavBHIEutLVpH/6irgof6ZOK1IudFtxdD9QdMV8bGGQ7F0vTntijT36KjheJ+2iJKrJznLvlCTrJHh+qgzZfk9Y9HO5ZUI',
      'SM+LeNzms/L3KYZsQy75ZfyurLBO5aqleF84JXPlitKtrShHuKJsSu8VJziLAp2///Xf/rM40wdrFadCKylJ7VtoVqsFFfxrde7tnBji6EZZH0zo4xIPmfJN',
      'Jl7nKo4NgFIS/bBiRQgFzl/9SjvNWS7ttRUV5uBaEmnUl/3iuKCVrLKFaXR9mi2mMcRrVUTLuhG7N1qV059ABw8Qqw2hAd8qegvMSynqDFXWvfyoZbkkVitC',
      'PiJxQqo6oKod7ihvtbRaxHXphr+QGBsOg6Em5MQhWlpc/qLJp9ENVoA217usRyss2XJFs3VkdVQ3d2dQN5Itt9pTlBjVzt/uHdupdjhb09EOOy5EINzxUuXI',
      'YtuQ7wCWx7sPo1Pia8Smnzc6haARaX4MvUEu3GHU4EDeGJqg31mDjdfsuHZ4b0NoGlCRZE2Ml0G2DFA6/2hF63OKTVrSjuWRPygheiiSbQepuHprU4nJml/r',
      'E4BRDZZN3TDLNc52feViMs4+4Fa+FguRkV0gPG80ztaVwwIbCVONVl+AJ3m+wGQPs9AqdoxaT2Fx21K/cuzn45HD6zy4KbHWjjBs70k0DKkaumqFs1hVAYyU',
      'wWwc3DGjKRjA9P+9mP17rl2d78TR4yZf05DTKcQ5MD1eGp2LE/Ykj3Eu7du/xA0prZDKnzE1+MHswNfWoaJh5Zy8WM7q8tVWfwbhu0WLOATXmRiS9eljsRX0',
      'Fe5qqwnPsiyDcLVM1gLLBv14gUEDHJkpTxZoTAaZMW6gWhykpbHVoAGNQZwW9viEnm4bldAiUmSta5E3G7UJEMSH4SOpNosPpb5UBaAnA2DzV1v/uquTuxeF',
      's/erIl8dQrd5DKf5glF/a1zlNROtUe558Fr3RL8Jc6b2fb867YpOB6H5Afkz3Kh7Mkh5DLIYsl6qRr/gTq5Olj4Zsbqu04g2xfyS4xUh48lY5c2fZqxywke0',
      '3/J+e9Du2uzZgU/cYMrUrkPVCOp6xV5b+j/ldeA68FreroCcw9xi8qPTdtu9ttfui+tHAbr2qXaZqbh41D1r1aBb8iTr1qEznuvYjfTQQPE6Exj1JWQMk7Ue',
      'N1FI/m4h7Z/Xi/nb43H6bVwk6eLcjsVvEm1LUoxjm9PayPjdrOqJ1uo/P+PMwi5AeehVB0AhitMNxdHLv/3l3w1k2fj7X//1X8jLOJLXBndhDrL3askucMvz',
      'fZPK+b494K/EwnsbWKzIm0Aru0cNNiCsSu77NxyI03g+J7Y1IDLpbMQnLshJJNKAdnbdTmm1xehgezGqSqPcRevnJbbT3prraeOAJZOgrK/6eBmnWlfRAo9I',
      'R97wvGGA9BUySXezj7DU2iGyQof7iApEB0jq1/T2aKfq47t2bcvzH5+FtszZQJtlYdIQlUl5COj3ZTsLwyDJgszYw5Fyz8/jaHteau+0u4rpN+V9Wmq8m2Ge',
      'MO89xPMPD6SIynvVKGsnV2JWLQLYFyO/JyocrJCpkwRblbJiaE2L/b0UgaZ2E3lPN5hgoIdTv5i7/Q/f5CKnrx6LZX0PJ+P2AbA8yPHYDS9XGYc6y0X6Mdku',
      'Nl03FZuKI1vXrf2oN5uDInBhRaHVyZ6V9t/CM45PlA5Cf454EPCLiydi9+eBP3m6lMgxv3l2WFi9ybq8/Gsa6pL8VRDdxcGMGU8XmXmgF86TdzdibTIxnJ4h',
      't0XE8x1Y1fP4YWLYkOe5Hvxn4HHJEJN9frD5BQYz4+wgEazdUsgYIe/+1hla3tAljmf1Ru6sY7njYcdyvHHHsYb9UccaDYYd17J7HWsMT5Y7hCd7PO4AlIMd',
      'octgaDl9eB4PBfQQGsaDAUB4xLGcgQffhj34DlA9Dzq5gGPgeZY97CuCfaDn9uHVG/SAXg/pe/h5NILOw9EI3/HHcODAz0Efe9n9MUctkdgOMOP1R5aD+O0B',
      '/EbSvR58HgnSngds9V0+QID0gKkRQo9EFw+GwAcHzYAdYHCQtttHoI7gl4MOBsjgwIHGsTMAVlwbhePBe3+IwhnBa1/0s/qO5NK2Rwqlgx3Fb6BFbM6VPQR+',
      'h2MY/tBFUbt8XI5loxxtoMMfXRDMGHe5QVYufhj0oW007MOz6/RID/EgmxwzYB0PoM0lfWgfEg95s4b22OrZA4QYAL7RGJ4GY88auH1r6ABddwgtPRDhGNGO',
      'hqBHZwQsI+8jbOLGMXTGSMBGzjwHiHBzADwu15U7GvOB848dMTzH9fjQOkL0KARQzLLTtzzXIaAhu7dASXl0DGQJ/wH27kAHu4eq7w1HIcCAGcBovU7PGnqO',
      'NR651hjw9cCuUKE9rjuOY0D4D47DQV30YcwzoIBPXh8F0ht0oM/Iw55gaeLZBVQA1QeOuZR7ZABkUKCj8QgRu30ifiJqbOU9xt4M2e8RRN5B5HwQI4+j7Yvn',
      '5YhLxEGzG144IGAHZCp+ATZEZ8PTC8AxxhZwIsDX6wEz/SHvOHZnttCt1fdQq46HXPaBwT74Xf8NIBhChAgHoOc+9xiPIuDIJfIXEupbg1EPLckbLYDr/gzQ',
      '9XHYnEaH0xTPwC3/xZGApuQvRAJSB6HzIf3Z6B4OP5DV3t0c6tZ66mRyySIfQiMtDosfnFmKWqfbf9kbDH7uTKQfpeeL0y8xz6iMebL+eICb9UH5wjKPV1j5',
      'hH5wdITwavIx7sA9FaKQ4Df98Sv7+RMgxDLgmDzblXYcRiGzDv5Xdir7BIdBaxqs3MkyRb5wkIHN/g6f9ul3r1M0rlcbNnEd59Bx1ievVGubEE9dVTbVcbiv',
      'brVttspWm3olrV41gyYsJu/Y7Km8rKuXpvbsi2qbAvPggeE18iDKWM5XqZV9Ln40wW7zf61+dc9q7ybk7nXMn19HPt+5s0UVu7Yrt9YvgPH7Xs2Xo/b9faGn',
      'bPzuOchf3ZjFXZLKgeJyTe/hX0ySJXNjzPdQpvHDpTxpZMgjdz38URFkT2yZlCMX2xjMyvI4wfP6VPz9LXNrF33Rq1dHOB11uK96rmDQcGB+1+lldSNPVuHP',
      'T7uLXo120uh+vUNHJgR7tmQPtznVqWuHXzWtu84P8Yrf2qJT/KtMeaz27or9odMsT+Po5qxq77VamOgi/jpXAVAtherATffKc/1ilqEjjdMCJy9uyMvhVZT6',
      'XeSmkodEYNUiQPL5Ui8L0BXZu0+X/UV5z5L8MV6lEQ0JwytiYOVhiLfLIHQAjTa/ZJfrl+/kjTv+gUaPRC4DM/AdcLHpI8n1C64KXcoAPFU3+eI0ALYLmtD/',
      'liU5lzddwex4SFZPKLGMGkITP+oL6UtTOaX5fIzRcJagIUZtkAkM3/5kXQh2c/YCBRVu7+N/xomc6n3aHfTKZ3GiSL7wrdUywVGuj5bexNnW7Fjfs6+dQqi0',
      'tY42/wuhbsCI6FAAAA=='
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

# Line-ending style used by this PC's copy of the project (used for the 3 new files)
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
$backupRoot = Join-Path (Split-Path $root -Parent) '_backup_receipt_polish'
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
  Write-Host 'Some files did not verify. Restore from the _backup_receipt_polish folder (one level up) and tell me.' -ForegroundColor Red
  exit 1
}
Write-Host 'DONE. 1 file changed. Originals are backed up in the folder above this one: _backup_receipt_polish' -ForegroundColor Green
Write-Host ''
Write-Host 'Next (test locally first if you like):'
Write-Host '  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue'
Write-Host '  npm run dev'

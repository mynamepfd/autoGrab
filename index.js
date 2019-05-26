var request = require('request').defaults({jar : true});
var util = require('util');
var async = require('async');

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


//var querystring = request('querystring') // 用于GET请求

function encodePwd(pwd) {
    return new Buffer(pwd).toString('base64');
}

function reqeustLoginStep1(mobileNo, cb) {
    request.post('http://www.114yygh.com/account/loginStep1.htm', {
        form : {
            mobileNo : mobileNo
        }
    }, cb)
}

function requestLoginStep2(token, mobileNo, /*smsType, loginType, redirectUrl,*/ password, cb) {
    request.post('http://www.114yygh.com/account/loginStep2.htm', {
        form : {
            'token' : token,
            'mobileNo' : mobileNo, 
            'smsType' : 3,
            'loginType' : 1,
            'redirectUrl' : '/index.html',
            'password' : encodePwd(password)
        }
    }, cb);
}

/**
 * 发短信验证码
 */
function getVerifyCode(cb) {
    request.post('http://www.114yygh.com/v/sendorder.htm', {
        form : {
            'jsAjax' : true
        }
    }, function(err, response, body) {
        if(err || response.statusCode != 200) {
            cb({code : -1, msg:'发送短信验证码失败'});
            return;
        }
        rl.question('请输入验证码:', (verifyCode) => {
            // verifyCode = verifyCode.toString().trim();
            cb({code : 1, data : verifyCode});
            rl.close();
          });
    });
}

/**
 * 抢号
 * 
 * hospitalId 医院ID
 * deparmentId 门诊ID
 * dutyDate 挂号日期
 * hospitalCardId 就诊卡号
 * patientId 就诊人编号
 */
function grabTicket(hospitalId, departmentId, dutyDate, hospitalCardId, patientId, cb) {
    // console.log('抢票...');
    async.waterfall([
        function findTicket(cb) { // 查找号源
            request.post('http://www.114yygh.com/dpt/build/duty.htm', {
                form : {
                    'hospitalId' : hospitalId,
                    'departmentId' : departmentId,
                    'dutyDate' : dutyDate,
                    'isAjax' : true
                }
            }, function(err, response, body) {
                var content = JSON.parse(body);
                if(err || content.hasError) {
                    cb({code : -1, msg:'查询号源失败:'+content.msg});
                    return;
                }
                var amDoctors = content.data['1']; // 上午号源
                var pmDoctors = content.data['2']; // 下午号源
                var doctors = amDoctors.concat(pmDoctors);
                for(var index in doctors) {
                    var doctor = doctors[index];
                    if(doctor.remainAvailableNumber > 0) { // 如果剩余号源大于0，那么挂这个医生的号
                        cb(null, doctor);
                        return;
                    }
                }
                cb({code : -1, msg:'找不到号源'}); // 挂号失败
            });
        },
        function buyTicket(doctor, cb) { // 挂号
            var confirmUrl = util.format('http://www.114yygh.com/order/confirm/%s-%s-%s-%s.htm',
                doctor.hospitalId, doctor.departmentId, doctor.doctorId, doctor.dutySourceId); // 下单
            request.get(confirmUrl, function(err, response, body) {
                if(err) { // 302?
                    cb({code : -1, msg:'获取下单页面失败'});
                    return;
                }
                setTimeout(function() {
                    cb(null, doctor)
                }, 5000); // 等五秒再获取验证码（绕过机器人验证）
            })
        },
        function sendVerifyCode(doctor, cb) {
            getVerifyCode(function(result) {
                if(result.code != 1) {
                    cb(result);
                } else {
                    cb(null, doctor, result.data);
                }
            });
        },
        function confirm(doctor, verifyCode, cb) { // 预约
            request.post('http://www.114yygh.com/order/confirmV1.htm', {
                form : {
                    'dutySourceId': doctor.dutySourceId,
                    'hospitalId': doctor.hospitalId,
                    'departmentId': doctor.departmentId,
                    'doctorId': doctor.doctorId,
                    'patientId': patientId,
                    'hospitalCardId': hospitalCardId,
                    'medicareCardId': '',
                    'reimbursementType': 10, // 报销类型：自费
                    'smsVerifyCode': verifyCode,
                    'childrenBirthday': '',
                    isAjax: true
                }
            }, function(err, response, body) {
                var content = JSON.parse(body);
                if(err || content.hasError) {
                    cb({code : -1, msg : '下单失败:'+content.msg});
                    return;
                }
                cb(null);
            })
        }
    ], function(err, result) {
        if(err && (err.code == -1 || err.code==-2)) {
            console.error(err.msg);
            cb(false); // 抢号失败
            return;
        }
        cb(true); // 抢号成功
    })
}

function parseToken(body) {
    var m = body.match(/<input type="hidden" name="token" value="[0-9]*">/)
    var token = m[0].replace('<input type="hidden" name="token" value="', '').replace('">', '');
    // console.log(token);
    return token;
}

var MOBILE_NO = '17600699857';      // 账号
var PASSWORD = 'hm51z9wg';          // 密码
var HOSPITAL_ID = '142';            // 北医三院
var DEPARTMENT_ID = '200039602';    // 运动医学科
var DUTY_DATE = '2019-05-31';       // 挂号日期
var HOSPITAL_CARD_ID = '001756374100';          // 就诊卡ID
var PATIENT_ID = '241434227';                   // 就诊人ID

// 调试用...
// var MOBILE_NO = '17600699857';      // 账号
// var PASSWORD = 'hm51z9wg';          // 密码
// var HOSPITAL_ID = '142';            // 北医三院
// var DEPARTMENT_ID = '200047442';    // 中医学科
// var DUTY_DATE = '2019-05-31';       // 挂号日期
// var HOSPITAL_CARD_ID = '001756374100';          // 就诊卡ID
// var PATIENT_ID = '241434227';                   // 就诊人ID

function main() {
    async.waterfall([
        function step1(cb) { // 登录之输入手机号
            reqeustLoginStep1(MOBILE_NO, function(err, response, body) {
                if(err || response.statusCode != 200) {
                    cb({code : -1, msg : '登录失败'});
                    return;
                }
                var token = parseToken(body);
                cb(null, token);
            });
        },
        function step2(token, cb) { // 登录之输入密码
            // console.log('token:' + token);
            requestLoginStep2(token, MOBILE_NO, PASSWORD, function(err, response, body) {
                if(err/* || response.statusCode == 302*/) { // 重定向?
                    cb({code : -1, msg : '登录失败'});
                    return;
                }
                cb(null);
            });
        },
        function loop(cb) { // 抢号循环

            /**
             * 请求一个非法日期时 {"data":[],"hasError":true,"code":4023,"msg":"不在放号周期内"} 
             * 请求一个满号日期时，正常返回医生列表
            request.post('http://www.114yygh.com/dpt/build/duty.htm', {
                form : {
                    'hospitalId' : '142',
                    'departmentId' : '200039602',
                    'dutyDate' : '2019-05-31',
                    'isAjax' : true
                }
            }, function(err, resp, body) {
                console.log(body);
            });
            */

            // grabTicket(HOSPITAL_ID, DEPARTMENT_ID, DUTY_DATE, HOSPITAL_CARD_ID, PATIENT_ID, function(result) {
            //     isSuccess = result;
            //     if(isSuccess) {
            //         console.log('抢号成功');
            //     }
            //     setTimeout(cb, 1000); // 1s执行1次
            // });

            // console.log('抢票循环...');
            var nextGrab = function() {
                grabTicket(HOSPITAL_ID, DEPARTMENT_ID, DUTY_DATE, HOSPITAL_CARD_ID, PATIENT_ID, function(isSuccess) {
                    if(isSuccess) {
                        console.log("抢号成功!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        cb(null);
                    } else {
                        setTimeout(nextGrab, 1000);
                    }
                });
            };
            nextGrab();
        }
    ], function(err, result) {
        if(err && err.code == -1) {
            console.error(err.msg);
            return;
        }
    });
}

main();

// request.post('http://www.114yygh.com/dpt/build/duty.htm', {
//     form : {
//         'hospitalId' : '142',
//         'departmentId' : '200039602',
//         'dutyDate' : '2019-06-03',
//         'isAjax' : true
//     }
// }, function(err, resp, body) {
//     console.log(body);
// });

// 登录第一步完成后会返回登录第二步的页面，里面包含一个隐藏的token
/*
<!DOCTYPE html><html lang="en"><head><script type="text/javascript">
        if(typeof GS=="undefined"||!GS)var GS={};GS.Url={basePath:"/",hs:"http://img.114yygh.com/ws/1.0/hs/",hps:"http://img.114yygh.com/",uploadUrl:"http://upload.idc3/xora/upload/s.htm",uploadFileUrl:""};var basePath=GS.Url.basePath,hs=GS.Url.hs,hps=GS.Url.hps,sign="1558699202151";</script><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="ie=edge"><link rel="shortcut icon" href="/hs/images/favicon.ico" type="image/x-icon"><title>北京市预约挂号统一平台</title><link rel="stylesheet" href="http://img.114yygh.com/ws/1.0/hs/css/account.css?v=1558699202151"></head><body><div class="login_index"><div class="login_logo_title"><div class="login_i_title"><a href="/index.htm"><img src="http://img.114yygh.com/ws/1.0/hs/images/logo.jpg"><h1>北京市预约挂号统一平台</h1></a></div></div><div class="login_i_content"><div class="login_i_con"><div id="login_index_djdl"><div class="djdl_tab_page hidden" id="pwd_div"><div class="djdl_menu"> 密码登录 </div><div class="djdl_tab_box"><form method="post" action="/account/loginStep2.htm#1" id="loginStep2_pwd_form"><input type="hidden" name="token" value="1558700485581"><input type="hidden" name="mobileNo" value="17600699858"><input type="hidden" name="smsType" value="3"><input type="hidden" name="loginType" value="1"><input type="hidden" name="redirectUrl" value="/index.htm"><div class="ksdl_ul"><div class="vre_err"><span class="qresultspan" id="pwd_error"><p generated="true" class="error"></p></span></div><dl class="djdl_ty_dl"><dt>密码登录</dt><input id="password" name="password" type="hidden"/><dd><input id="pwd" type="password" class="register_input" placeholder="请输入密码" onkeydown="passSubmit(event)"><input type="text" style="display:none;"></dd></dl><div class="tydiv"><input id="loginStep2_pwd" name="next" type="button" class="ksdl_ul_denglu djdl_nav_qr" value="下一步"><span class="passLogin" att="yzm">验证码登录</span></div></div><div class="twoList"><span onclick="javascript:window.location.href='/account/resetPassword.htm'">忘记密码</span><span onclick="javascript:window.location.href='/help/retracc1.htm'">账号申诉</span></div></form></div></div><div class="djdl_tab_page" id="yzm_div"><div class="djdl_menu"> 验证码登录 </div><div class="djdl_tab_box"><form method="post" action="/account/loginStep2.htm#2" id="loginStep2_yzm_form"><input type="hidden" name="token" value="1558700485581"><input type="hidden" name="mobileNo" value="17600699858"><input type="hidden" name="smsType" value="3"><input type="hidden" name="loginType" value="2"><input type="hidden" name="redirectUrl" value="/index.htm"><div class="ksdl_ul"><div class="vre_err"><span class="qresultspan" id="yzm_error"><p generated="true" class="error"></p></span></div><dl class="djdl_ty_dl"><dt>手机验证码</dt><dd><input name="yzm" id="yzm" type="text" class="register_input register_input1" maxlength="6" placeholder="请输入验证码" onkeyup="this.value=this.value.replace(/\D/g,'')" onafterpaste="this.value=this.value.replace(/\D/g,'')"><span class="getCode">获取验证码</span><span class="timeDown hidden"></span><span class="getCode getAgain hidden">重新获取</span></dd></dl><div class="tydiv"><input id="loginStep2_yzm" name="next" type="button" class="ksdl_ul_denglu djdl_nav_qr" value="下一步"><span class="passLogin" att="pwd" id="pwd_login">密码登录</span></div></div><div class="twoList"><span onclick="javascript:window.location.href='/account/resetPassword.htm'">忘记密码</span><span onclick="javascript:window.location.href='/help/retracc1.htm'">账号申诉</span></div></form></div></div></div></div><input type="hidden" id="mobileNo" name="mobileNo" value="17600699858"><input type="hidden" id="smsType" name="smsType" value="3"><input type="hidden" id="userSize" name="userSize" value="0"><input type="hidden" id="qresultspan" name="qresultspan" value=""><div class="login_i_con_imgRc"><div class="logoImg"><div class="logo1"><img class="" src="http://img.114yygh.com/ws/1.0/hs/images/account/footer_ewm.png" alt=""></div><div class="logo2"><img class="" src="http://img.114yygh.com/ws/1.0/hs/images/account/footer_ewm2.png" alt=""></div></div><div class="desc"><div class="descleft"><span><img src="http://img.114yygh.com/ws/1.0/hs/images/account/weixinLogo.png" alt="">微信扫一扫关注</span><span>“北京114预约挂号平台”</span><span>快速挂号</span></div><div class="descRight"><span>扫一扫下载</span><span>“114健康”APP</span></div></div><div class="des"><span>北京市卫健委官方指定平台</span><span>快速挂号 安全放心</span></div></div></div></div><script type="text/javascript" src="http://img.114yygh.com/ws/1.0/hs/js/jquery.js"></script><script type="text/javascript" src="http://img.114yygh.com/ws/1.0/hs/js/base64.js"></script><script type="text/javascript" src="http://img.114yygh.com/ws/1.0/hs/js/md5.js"></script><script type="text/javascript" src="http://img.114yygh.com/ws/1.0/hs/js/global.js"></script><script type="text/javascript">
    function passSubmit(a){if((a||window.event).keyCode==13)a=$("#pwd").val(),a==""?errorMsg("\u5bc6\u7801\u4e0d\u80fd\u4e3a\u7a7a"):($("#password").val(Base64.encode(a)),$("#loginStep2_pwd_form").submit())}function errorMsg(a){$(".error").html(a).show()}
$(function(){var a=location.hash;a=="#2"||a==""?($("#pwd_div").hide(),$("#yzm_div").show()):($("#pwd_div").show(),$("#yzm_div").hide());var b=60;$("#userSize").val()!=1&&($("#pwd_div").hide(),$("#yzm_div").show(),$("#pwd_login").hide());$(".getCode").click(function(){$(".error").hide();$(".getCode").removeAttr("disabled");var a=$("#mobileNo").val(),d=$("#smsType").val();$.ajax({url:basePath+"v/sendSmsCode.htm",type:"post",dataType:"json",data:{smsType:d,mobileNo:a,isAjax:!0},success:function(a){$(".getCode").removeAttr("disabled");
if(a.code=="200"){$(".error").html(prompts.sms_code_send_ok).show();$(".getCode").hide();$(".timeDown").text(b+"s\u540e\u91cd\u65b0\u83b7\u53d6");$(".timeDown").show();var c=setInterval(function(){b--;$(".timeDown").text(b+"s\u540e\u91cd\u65b0\u83b7\u53d6");$(".timeDown").show();b==0&&(clearInterval(c),$(".timeDown").hide(),$(".getAgain").show(),b=60)},1E3)}else alert(a.msg)},error:function(){$(".getCode").removeAttr("disabled");alert("\u7cfb\u7edf\u7e41\u5fd9\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\uff01")}})});
$("input[name='next']").click(function(){var a=$(this).attr("id");$(".error").html("").hide();a=="loginStep2_pwd"?(a=$("#pwd").val(),a==""?errorMsg("\u5bc6\u7801\u4e0d\u80fd\u4e3a\u7a7a"):($("#password").val(Base64.encode(a)),$("#loginStep2_pwd_form").submit())):$("#yzm").val()==""?errorMsg("\u624b\u673a\u9a8c\u8bc1\u7801\u4e0d\u80fd\u4e3a\u7a7a"):$("#loginStep2_yzm_form").submit()});$(".passLogin").click(function(){var a=$(this).attr("att");$(".error").html("").hide();a=="yzm"?($("#pwd_div").hide(),
$("#yzm_div").show()):($("#pwd_div").show(),$("#yzm_div").hide())})});</script></body></html>
*/
// 在发送登录请求时对密码进行了base64编码
// var pwd = new Buffer('hm51z9wg').toString('base64');
// console.log(pwd)

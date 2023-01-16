const User = require("../models/users");
const jwt = require("jsonwebtoken");
const { generateOTP, mailTransport, generateOTPTemplate, forgotPasswordEmailTemplate, plainEmailTemplate } = require("../utils/Mail");
const VerficationToken = require("../models/verificationToken");
const { isValidObjectId } = require("mongoose");
const ResetToken = require("../models/resetToken");

exports.registerUser = async (req,res) => {
    try {
        
        const { name , email , password , description } = req.body;
        
        const isAlreadyExists = await User.findOne({email});
        
        if(isAlreadyExists){
            return res.status(401).json({error : `User Already Exists !!` });
        }

        const newUser = new User({ name , email , password , description });

        const OTP = generateOTP();

        const verficationToken =  new VerficationToken({
            user : newUser,
            token : OTP
        });

        await verficationToken.save();
        await newUser.save();

        mailTransport().sendMail({
            from : `AiBlogApp@gmail.com`,
            to : newUser.email,
            subject : "Verification Your Email Account",
            html : generateOTPTemplate(OTP)
        })

        res.status(200).json({message : `User Registration Successfull`, userId : newUser._id});

    } catch (error) {
        res.status(500).json({error : error.message});
    }
}

exports.loginUser = async (req,res) => {
    try {
        
        const { email , password } = req.body;

        if(!email.trim() || !password.trim()){
            return res.status(400).json({ error : `Email - Password is Missing !!`});
        }

        const user = await User.findOne({email});

        if(!user){
            return res.status(400).json({ error : `User Not Found !!`});
        }

        const checkPassword = await user.comparePassword(password);

        if(!checkPassword){
            return res.status(400).json({ error : `Invalid Password !!`});
        }
        
        const token = jwt.sign({ _id : user._id}, process.env.JWT_SECRET_KEY, {
            expiresIn : "30d"
        });

        return res.status(200).json({message : `User Login Successfully` , token, name : user.name , email : user.email});

    } catch (error) {
        res.status(500).json({error : error.message});
    }
}

exports.verifyEmail = async (req,res) => {

    const { userId , OTP } = req.body;

    if(!userId || !OTP.trim() ){
        return res.status(404).json({error : `Invalid Request`});
    }

    if(!isValidObjectId(userId)){
        return res.status(404).json({error : `Invalid User ID`});
    }

    const user = await User.findById(userId);

    if(!user){
        return res.status(404).json({error : `User Not Found`});
    }

    if(user.verified){
        return res.status(400).json({error : `This Account is already Verified`});
    }

    const token = await VerficationToken.findOne({user : user._id});

    if(!token){
        return res.status(400).json({error : `Resend OTP`});
    }

    const isMatched = await token.compareToken(OTP);

    if(!isMatched){
        return res.status(400).json({error : `OTP is Not Valid`});
    }

    user.verified = true;

    await VerficationToken.findByIdAndDelete(token._id);
    await user.save();

    mailTransport().sendMail({
        from : `AiBlogApp@gmail.com`,
        to : user.email,
        subject : "Email Verified Successfully !!",
        html : plainEmailTemplate("Account Verification Successfully")
    });

    return res.json({message : `Email Verified Successfully !!` , user});
}

exports.forgotPassword = async (req,res) => {
    try {
        const { email } = req.body;
        if(!email){
            return res.status(404).json({error : `Please Enter a Email`});
        }

        const user = await User.findOne({email});
        
        if(!user){
            return res.status(404).json({error : `User Not Found`});
        }

        const resetToken = await ResetToken.findOne({user : user._id});
        if(resetToken){
            return res.status(404).json({error : `Only After One Hour You can requrest for Another Token`});
        }

        const ResetTokenOTP = generateOTP();

        const newResetToken  =  new ResetToken({
            user : user._id,
            token : ResetTokenOTP
        });

        await newResetToken.save();

        mailTransport().sendMail({
            from : `AiBlogApp@gmail.com`,
            to : user.email,
            subject : "Reset Password",
            html : forgotPasswordEmailTemplate(`http://localhost:3000/reset-password?token=${newResetToken.token}&id=${user._id}`)
        });

        res.status(200).json({message : `Password Reset Link is send to Your Email`});

    } catch (error) {
        res.json({error : error.message})
    }

}

exports.resetPassword = async (req,res) => {
    const {password} = req.body;
    
    const user = await User.findById(req.users._id);

    if(!user){
        return res.status(404).json({error : `User Not Found`});
    }

    const isSamePassword = await user.comparePassword(password);
    if(isSamePassword){
        return res.status(404).json({error : `Old and New Password is Same`});
    }

    user.password = password;
    await user.save();

    await ResetToken.findOneAndDelete({user : user._id});

    mailTransport().sendMail({
        from : `AiBlogApp@gmail.com`,
        to : user.email,
        subject : "Password Reset Password",
        html : plainEmailTemplate("Password Reset Successfully")
    });

    res.status(200).json({message : `Password Reset Successfully !!`});

}

exports.getUser = async (req,res) => {
    try {
        const {User_id} = req;

        const user = await User.findById(User_id , "-password").populate("blogs");
        
        if(!user){
            return res.status(400).json({message : `User Not Found !!`});
        }

        return res.status(200).json({message : `User Find Successfull`, user});

    } catch (error) {
        res.status(500).json({error : error.message});
    }
}


